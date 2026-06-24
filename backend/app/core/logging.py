import logging

from uvicorn.logging import DefaultFormatter

FILENAME_WIDTH = 17


class _FileNameFormatter(DefaultFormatter):
    def formatMessage(self, record: logging.LogRecord) -> str:
        record.filename_field = f"{record.filename}:".ljust(FILENAME_WIDTH)
        return super().formatMessage(record)


def setup_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(
        _FileNameFormatter(
            fmt="%(asctime)s %(levelprefix)s %(filename_field)s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    logging.basicConfig(level=level, handlers=[handler])
