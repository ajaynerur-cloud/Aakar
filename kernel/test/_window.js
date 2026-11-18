// preload for the kernel tests: node has no `window`; older builds of the kernel looked it up directly
if (typeof window === 'undefined') globalThis.window = globalThis;
