"""Mamdani reduced-rule suspicion engine.

The values and membership breakpoints are intentionally centralized here so
Chapter 3 calibration can change them without altering the API contract.
Scores are review indicators only; this engine never makes a misconduct verdict.
"""
from dataclasses import dataclass
import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl
from app.models.schemas import ContributingFactor, ReducedIndicators, FullIndicators

@dataclass(frozen=True)
class Memberships:
    tab: tuple[str, ...]
    app: tuple[str, ...]
    idle: tuple[str, ...]
    usb: tuple[str, ...]

class ReducedFuzzyEngine:
    def __init__(self) -> None:
        self.tab = ctrl.Antecedent(np.arange(0, 21, 1), "tab")
        self.app = ctrl.Antecedent(np.arange(0, 1801, 1), "app")
        self.idle = ctrl.Antecedent(np.arange(0, 1801, 1), "idle")
        self.usb = ctrl.Antecedent(np.arange(0, 11, 1), "usb")
        self.score = ctrl.Consequent(np.arange(0, 101, 1), "score")
        self.tab["low"] = fuzz.trapmf(self.tab.universe, [0, 0, 2, 4]); self.tab["medium"] = fuzz.trimf(self.tab.universe, [2, 5, 9]); self.tab["high"] = fuzz.trapmf(self.tab.universe, [6, 9, 20, 20])
        self.app["none"] = fuzz.trapmf(self.app.universe, [0, 0, 5, 15]); self.app["brief"] = fuzz.trimf(self.app.universe, [5, 45, 180]); self.app["extended"] = fuzz.trapmf(self.app.universe, [120, 300, 1800, 1800])
        self.idle["low"] = fuzz.trapmf(self.idle.universe, [0, 0, 30, 90]); self.idle["medium"] = fuzz.trimf(self.idle.universe, [60, 180, 420]); self.idle["high"] = fuzz.trapmf(self.idle.universe, [300, 600, 1800, 1800])
        self.usb["none"] = fuzz.trapmf(self.usb.universe, [0, 0, 0, 1]); self.usb["occurred"] = fuzz.trapmf(self.usb.universe, [1, 1, 10, 10])
        self.score["low"] = fuzz.trapmf(self.score.universe, [0, 0, 20, 40]); self.score["medium"] = fuzz.trimf(self.score.universe, [30, 55, 75]); self.score["high"] = fuzz.trapmf(self.score.universe, [65, 80, 100, 100])
        # 16 reduced-input Mamdani rules. No one rule is a misconduct conclusion.
        rules = [
            ctrl.Rule(self.tab["low"] & self.app["none"] & self.idle["low"] & self.usb["none"], self.score["low"]),
            ctrl.Rule(self.tab["high"] & self.app["extended"], self.score["high"]),
            ctrl.Rule(self.tab["high"] & self.idle["high"], self.score["high"]),
            ctrl.Rule(self.app["extended"] & self.idle["high"], self.score["high"]),
            ctrl.Rule(self.app["extended"] & self.usb["occurred"], self.score["high"]),
            ctrl.Rule(self.tab["high"] & self.usb["occurred"], self.score["high"]),
            ctrl.Rule(self.tab["medium"] & self.app["brief"], self.score["medium"]),
            ctrl.Rule(self.tab["medium"] & self.idle["medium"], self.score["medium"]),
            ctrl.Rule(self.tab["medium"] & self.usb["occurred"], self.score["medium"]),
            ctrl.Rule(self.app["brief"] & self.idle["medium"], self.score["medium"]),
            ctrl.Rule(self.app["brief"] & self.usb["occurred"], self.score["medium"]),
            ctrl.Rule(self.idle["high"] & self.usb["occurred"], self.score["medium"]),
            ctrl.Rule(self.tab["low"] & self.app["brief"] & self.idle["low"], self.score["low"]),
            ctrl.Rule(self.tab["low"] & self.app["none"] & self.idle["medium"], self.score["low"]),
            ctrl.Rule(self.tab["low"] & self.app["none"] & self.usb["occurred"], self.score["low"]),
            ctrl.Rule(self.tab["medium"] & self.app["extended"], self.score["high"]),
        ]
        self.system = ctrl.ControlSystem(rules)

    @staticmethod
    def _label(value: float, sets: dict[str, np.ndarray], universe: np.ndarray) -> str:
        return max(sets, key=lambda key: fuzz.interp_membership(universe, sets[key].mf, value)).replace("_", " ").title()

    def score_indicators(self, values: ReducedIndicators | FullIndicators, rule_set: str = "reduced") -> tuple[int, str, list[ContributingFactor]]:
        simulation = ctrl.ControlSystemSimulation(self.system)
        inputs = {"tab": min(values.tab_switch_count, 20), "app": min(values.blacklisted_app_seconds, 1800), "idle": min(values.idle_seconds, 1800), "usb": min(values.usb_event_count, 10)}
        for name, value in inputs.items(): simulation.input[name] = value
        simulation.compute(); score = int(round(simulation.output["score"])); tier = "Low" if score < 35 else "Medium" if score < 70 else "High"
        factors = [
            ContributingFactor(indicator="tab_switch_count", value=values.tab_switch_count, membership=self._label(inputs["tab"], self.tab.terms, self.tab.universe)),
            ContributingFactor(indicator="blacklisted_app_seconds", value=values.blacklisted_app_seconds, membership=self._label(inputs["app"], self.app.terms, self.app.universe)),
            ContributingFactor(indicator="idle_seconds", value=values.idle_seconds, membership=self._label(inputs["idle"], self.idle.terms, self.idle.universe)),
            ContributingFactor(indicator="usb_event_count", value=values.usb_event_count, membership=self._label(inputs["usb"], self.usb.terms, self.usb.universe)),
        ]
        if rule_set == "full" and isinstance(values, FullIndicators):
            # Optional sensors only contribute when the session enabled them; None
            # is deliberately omitted, rather than treated as suspicious data.
            sensor_values = {"face_not_visible": values.face_not_visible, "excessive_eye_movement": values.excessive_eye_movement, "possible_talking": values.possible_talking, "multiple_faces": values.multiple_faces, "voice_detected": values.voice_detected}
            active = {name: value for name, value in sensor_values.items() if value is not None}
            sensor_risk = max(active.values(), default=0.0)
            # Preserve the calibrated reduced-rule output while adding bounded
            # review evidence; multi-face has the strongest sensor weight.
            weighted = max([sensor_risk] + [value * (1.25 if name == "multiple_faces" else .8) for name, value in active.items()])
            score = min(100, int(round(score + weighted * 35)))
            tier = "Low" if score < 35 else "Medium" if score < 70 else "High"
            factors.extend(ContributingFactor(indicator=name, value=value, membership="Observed" if value >= .2 else "Low") for name, value in active.items())
        return score, tier, factors

engine = ReducedFuzzyEngine()
