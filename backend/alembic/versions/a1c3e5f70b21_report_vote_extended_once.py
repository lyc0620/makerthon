"""report_votes.extended: 한 사람당 제보 연장은 한 번만

Revision ID: a1c3e5f70b21
Revises: 17adb2052d3f
Create Date: 2026-11-21 14:10:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1c3e5f70b21"
down_revision: Union[str, Sequence[str], None] = "17adb2052d3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 이미 '확인'으로 들어간 표는 연장을 한 번 한 것으로 봐요.
    with op.batch_alter_table("report_votes", schema=None) as batch_op:
        batch_op.add_column(sa.Column("extended", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE report_votes SET extended = 1 WHERE vote = 'confirm'")


def downgrade() -> None:
    with op.batch_alter_table("report_votes", schema=None) as batch_op:
        batch_op.drop_column("extended")
