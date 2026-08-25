from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "proctorx",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    # Version the queue so an older worker left alive by a reload cannot pick
    # up report jobs created by the current application code.
    task_default_queue="proctorx_v2",
    task_routes={"reports.build.v2": {"queue": "proctorx_v2"}},
)
