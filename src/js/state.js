// Shared mutable state. ES modules can't reassign imported bindings, so these live on one object.
export const state = {
  currentFileType: 'image',
  currentExifRows: [],
  currentPalette: [],
  currentBuffer: null,
  currentMime: '',
  currentSourceUrl: null,
  imageQueue: [], // [{ file, sourceUrl, cacheId, status:'analyzing'|'done'|'error', result:{type,args}|null }]
  queueIndex: -1, // currently displayed slot index
};
