import React from "react";
import { createRoot } from "react-dom/client";
import { useResource } from "../../src/features/common/hooks/use-resource";

type PendingRequest = {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  key: string;
};

declare global {
  interface Window {
    resourceTest: {
      pending: PendingRequest[];
      setKey: (key: string) => void;
      refresh: () => Promise<void>;
    };
  }
}

const pending: PendingRequest[] = [];

function Harness() {
  const [key, setKey] = React.useState("first");
  const resource = useResource(
    () => new Promise<string>((resolve, reject) => pending.push({ resolve, reject, key })),
    key,
  );
  window.resourceTest = { pending, setKey, refresh: resource.refresh };
  return React.createElement(
    "pre",
    { id: "state" },
    JSON.stringify({ key, data: resource.data, error: resource.error, loading: resource.loading }),
  );
}

createRoot(document.getElementById("root")!).render(React.createElement(Harness));
