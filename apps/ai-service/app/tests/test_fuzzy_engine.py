from app.models.schemas import ReducedIndicators
from app.services.fuzzy_engine import engine


def test_low_indicators_produce_low_review_score():
    score, tier, factors = engine.score_indicators(ReducedIndicators())
    assert score < 35
    assert tier == "Low"
    assert len(factors) == 4


def test_high_tab_and_extended_blacklisted_app_produce_high_review_score():
    score, tier, _ = engine.score_indicators(
        ReducedIndicators(tab_switch_count=10, blacklisted_app_seconds=600)
    )
    assert score >= 70
    assert tier == "High"


def test_tab_switch_thresholds_match_product_policy():
    expected = {
        1: "Low",
        2: "Low",
        3: "Medium",
        5: "Medium",
        6: "High",
        10: "High",
    }

    for count, expected_tier in expected.items():
        _, tier, _ = engine.score_indicators(
            ReducedIndicators(tab_switch_count=count)
        )
        assert tier == expected_tier


def test_uncovered_rule_combination_returns_a_review_score():
    score, tier, factors = engine.score_indicators(
        ReducedIndicators(idle_seconds=1_000)
    )

    assert score == 35
    assert tier == "Medium"
    assert len(factors) == 4
