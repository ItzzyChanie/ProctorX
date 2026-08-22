from app.core.celery_app import celery_app
from app.services.report_builder import build_report
@celery_app.task(name="reports.build")
def build_report_task(payload: dict, fmt: str): return build_report(payload, fmt)
