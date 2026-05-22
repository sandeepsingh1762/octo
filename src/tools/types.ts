export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  func: (params: Record<string, unknown>, config: Record<string, unknown>) => string | Promise<string>;
  read_only: boolean;
  concurrent_safe: boolean;
}
