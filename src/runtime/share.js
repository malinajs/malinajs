let current_destroyList = [], current_cd, destroyResults;

const $onDestroy = (fn) => fn && current_destroyList.push(fn);

const share = {
  $onDestroy,
  current_destroyList,
  current_cd,
  destroyResults
};

export { share, $onDestroy };
