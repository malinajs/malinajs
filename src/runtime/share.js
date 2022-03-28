let current_destroyList = [], current_cd, destroyResults;

const $onDestroy = (fn) => fn && current_destroyList.push(fn);

const share = {
  $onDestroy,
  get current_destroyList() {
    return current_destroyList;
  },
  set current_destroyList(value) {
    current_destroyList = value;
  },
  get current_cd() {
    return current_cd;
  },
  set current_cd(value) {
    current_cd = value;
  },
  get destroyResults() {
    return destroyResults;
  },
  set destroyResults(value) {
    destroyResults = value;
  }
};

export { share, $onDestroy };
