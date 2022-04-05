export let current_destroyList = [], current_cd, destroyResults;
export const $onDestroy = (fn) => fn && current_destroyList.push(fn);
