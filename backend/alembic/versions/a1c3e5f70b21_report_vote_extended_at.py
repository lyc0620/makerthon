"""report_votes.extended_at: 같은 사람은 5분이 지나야 제보 시간을 다시 연장

Revision ID: a1c3e5f70b21
Revises: 17adb2052d3f
Create Date: 2026-11-21 14:10:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models.types


revision: str = "a1c3e5f70b21"
down_revision: Union[str, Sequence[str], None] = "17adb2052d3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("report_votes", schema=None) as batch_op:
        batch_op.add_column(sa.Column("extended_at", app.models.types.UTCDateTime(timezone=True), nullable=True))
    # 이미 '확인'으로 들어간 표는 그 표를 넣은 때 연장한 것으로 봐요.
    op.execute("UPDATE report_votes SET extended_at = created_at WHERE vote = 'confirm'")


def downgrade() -> None:
    with op.batch_alter_table("report_votes", schema=None) as batch_op:
        batch_op.drop_column("extended_at")
