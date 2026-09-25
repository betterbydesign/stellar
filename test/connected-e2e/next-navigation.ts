export function useRouter() {
  return {
    push(path: string) { window.location.assign(path); },
    replace(path: string) { window.location.replace(path); },
    back() { window.history.back(); },
    forward() { window.history.forward(); },
    refresh() { window.location.reload(); },
    prefetch: async () => {},
  };
}

export function usePathname() { return window.location.pathname; }
export function useSearchParams() { return new URLSearchParams(window.location.search); }
