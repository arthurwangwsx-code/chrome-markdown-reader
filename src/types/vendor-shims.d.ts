declare module '@markdown-viewer/draw-uml' {
  export function textToDrawioXml(input: string, options?: Record<string, unknown>): Promise<string>;
}

declare module '@markdown-viewer/drawio2svg' {
  export function convert(input: string, options?: Record<string, unknown>): string;
}

declare module 'markdown-it-task-lists' {
  const plugin: import('markdown-it').PluginWithOptions<Record<string, unknown>>;
  export default plugin;
}

