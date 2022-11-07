export let current_destroyList, current_mountList, current_cd, destroyResults;
export const $onDestroy = fn => fn && current_destroyList.push(fn);
export const $onMount = fn => current_mountList.push(fn);
