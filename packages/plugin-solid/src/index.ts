import { createReactivityAdapter } from "signaldb";
import { createSignal, onCleanup } from "solid-js";

const solidReactivityAdapter = createReactivityAdapter({
  create: () => {
    const [depend, rerun] = createSignal(undefined, { equals: false });
    return {
      depend: () => {
        depend();
      },
      notify: () => {
        rerun();
      },
    };
  },
  isInScope: undefined,
  onDispose: (callback) => {
    onCleanup(callback);
  },
});

export default solidReactivityAdapter;
