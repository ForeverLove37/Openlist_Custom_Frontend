import { LoaderCircle } from "lucide-react";

export function NativeManagement({ sessionReady }: { sessionReady: boolean }) {
  if (!sessionReady) {
    return <div className="admin-gate" role="status"><LoaderCircle className="spin" size={28} /><span>Preparing secure management session</span></div>;
  }
  return (
    <section className="native-management" aria-label="Native OpenList management">
      <iframe
        title="Native OpenList management"
        src="/legacy-tunnel/@manage"
        referrerPolicy="same-origin"
        sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
      />
    </section>
  );
}
