from __future__ import annotations

import inspect
import logging
import os
from collections.abc import Awaitable
from typing import cast

from livekit.agents import Agent, function_tool, llm
from livekit.plugins import cartesia, deepgram, openai, silero

from agent.prompts import PARTSLINE_SYSTEM_PROMPT
from agent import session_limits
from agent.tools.lookup_part import lookup_part


LOGGER = logging.getLogger(__name__)
AGENT_NAME = "partsline-retrieval"
GREETING = "Parts counter, go ahead."
ENDPOINTING_MIN_DELAY_SECONDS = 1.0
ENDPOINTING_MAX_DELAY_SECONDS = 3.0
SESSION_LIMIT_SHUTDOWN_REASON = "session limits reached"
SessionLimits = session_limits.SessionLimits

LOOKUP_PART_TOOL = function_tool(
    lookup_part,
    name="lookup_part",
    description=(
        "Look up an auto part using mandatory year, make, and model metadata "
        "filters. Returns single_match, ambiguous, superseded, or no_match."
    ),
)


class PartsLineSessionState:
    def __init__(self) -> None:
        self.captured_vehicle: dict[str, str] = {}


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required for Dartmouth Chat LLM config")
    return value


def build_dartmouth_chat_llm():
    return openai.LLM(
        model=required_env("DARTMOUTH_CHAT_MODEL"),
        api_key=required_env("DARTMOUTH_CHAT_API_KEY"),
        base_url=required_env("DARTMOUTH_CHAT_BASE_URL"),
    )


class PartsLineAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=PARTSLINE_SYSTEM_PROMPT)
        self.session_limits: session_limits.SessionLimits | None = None

    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        if self.session_limits is not None:
            self.session_limits.record_user_activity()


def build_session():
    from livekit.agents import AgentSession, TurnHandlingOptions, inference

    return AgentSession(
        stt=deepgram.STT(model="nova-3", language="en"),
        llm=build_dartmouth_chat_llm(),
        tts=cartesia.TTS(model="sonic-3"),
        vad=silero.VAD.load(),
        tools=[LOOKUP_PART_TOOL],
        userdata=PartsLineSessionState(),
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
            endpointing={
                "mode": "fixed",
                "min_delay": ENDPOINTING_MIN_DELAY_SECONDS,
                "max_delay": ENDPOINTING_MAX_DELAY_SECONDS,
            },
            interruption={"enabled": True, "mode": "adaptive"},
        ),
    )


def build_agent() -> PartsLineAgent:
    return PartsLineAgent()


async def _await_if_needed(result: object) -> None:
    if inspect.isawaitable(result):
        await cast(Awaitable[object], result)


async def _shutdown_for_session_limits(session, ctx) -> None:
    LOGGER.info("session limit reached; speaking closing line")
    closing_playout = session.say(
        session_limits.CLOSING_LINE, allow_interruptions=False
    )
    await closing_playout
    LOGGER.info("closing line playout completed; closing session and room")
    await _await_if_needed(session.aclose())
    await _await_if_needed(ctx.room.disconnect())
    await _await_if_needed(ctx.shutdown(SESSION_LIMIT_SHUTDOWN_REASON))


async def run_retrieval_session(ctx) -> None:
    session = build_session()
    agent = build_agent()
    await session.start(room=ctx.room, agent=agent)

    async def shutdown_for_session_limits() -> None:
        await _shutdown_for_session_limits(session, ctx)

    limits = SessionLimits(
        on_idle_timeout=shutdown_for_session_limits,
        on_max_duration=shutdown_for_session_limits,
    )
    agent.session_limits = limits
    limits.start()

    async def stop_session_limits(_: str = "") -> None:
        await limits.stop()

    ctx.add_shutdown_callback(stop_session_limits)
    LOGGER.info("session started; speaking greeting", extra={"greeting": GREETING})
    await session.say(GREETING, allow_interruptions=True)
    LOGGER.info("greeting speak call completed")


def create_server():
    from livekit import agents
    from livekit.agents import AgentServer

    server = AgentServer()

    @server.rtc_session(agent_name=AGENT_NAME)
    async def partsline_retrieval(ctx: agents.JobContext) -> None:
        await run_retrieval_session(ctx)

    return server


def main() -> None:
    from dotenv import load_dotenv
    from livekit import agents

    load_dotenv()
    agents.cli.run_app(create_server())


if __name__ == "__main__":
    main()
