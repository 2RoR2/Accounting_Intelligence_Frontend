import { Application } from "@/features/application";

/** Plan L: sales/purchases documents, bank entries and the catalog (see features/localadmin/route-content.tsx). */
export default function Page() {
  return <Application path={["company", "catalog"]} />;
}
