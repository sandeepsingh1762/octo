import type { Message } from "../ai/types.js";

export class AgentState {
  messages: Message[] = [];
  total_input_tokens = 0;
  total_output_tokens = 0;
  turn_count = 0;
  cancelled = false;
}
