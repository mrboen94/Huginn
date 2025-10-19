import createTool from './create_mcp_tool.ts';
import removeTool from './remove_generated_tool.ts';
import renameTool from './rename_generated_tool.ts';
import editTool from './edit_generated_tool.ts';

export const tools = [createTool, removeTool, renameTool, editTool];
export default tools[0];
