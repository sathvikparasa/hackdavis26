type FilterState = {
  crops: string[];
  pests: string[];
  severities: string[];
};

const DEFAULT: FilterState = {
  crops: ['All Crops'],
  pests: ['All Pests'],
  severities: ['All'],
};

let _state: FilterState = { ...DEFAULT };
let _listeners: Array<(s: FilterState) => void> = [];

export function getFilterState(): FilterState {
  return _state;
}

export function setFilterState(state: FilterState) {
  _state = state;
  for (const l of _listeners) l(state);
}

export function resetFilterState() {
  setFilterState({ ...DEFAULT });
}

export function subscribeFilterState(listener: (s: FilterState) => void) {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}
