import { useEffect, useRef, useState, type ReactNode } from "react";
import { getAddress, type Address } from "viem";
import { usePulse } from "./store";
import { callSign, errorMessage, type Drone } from "./domain";
export function PulseMark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "pulse-mark small" : "pulse-mark"}
      viewBox="0 0 40 44"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 2 38 12v20L20 42 2 32V12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M8 22h7l3-7 5 14 3-7h7" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
export function SectionHeading({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        <p className="muted">{text}</p>
      </div>
      {children}
    </div>
  );
}
export function ConnectButton({
  label = "Connect wallet",
  primary = false,
}: {
  label?: string;
  primary?: boolean;
}) {
  const { wallet } = usePulse();
  return (
    <button
      className={primary ? "button primary" : "button"}
      disabled={wallet.pending}
      onClick={() => void wallet.connect()}
    >
      {wallet.pending ? "Connecting…" : label}
    </button>
  );
}
export function Gate({ children }: { children: ReactNode }) {
  const { wallet, runtime, safe, readError } = usePulse();
  if (!wallet.account) return <ConnectButton primary />;
  if (wallet.chainId !== runtime?.manifest.chainId)
    return (
      <p className="notice">
        Switch to {runtime?.manifest.network.name ?? "the deployment network"}{" "}
        using the network control above.
      </p>
    );
  if (!safe)
    return (
      <p className="notice">
        {readError
          ? "Transactions are paused until live contract data is available. Use Refresh data above."
          : "Verifying live contract state…"}
      </p>
    );
  return children;
}
export function ActionButton({
  id,
  label,
  onClick,
  disabled = false,
  primary = true,
}: {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const { txs, locked, safe } = usePulse();
  const phase = txs[id]?.phase;
  const pending =
    phase === "simulating" || phase === "wallet" || phase === "pending";
  return (
    <button
      type="button"
      className={`button ${primary ? "primary" : ""}`}
      disabled={disabled || locked || !safe}
      onClick={onClick}
      aria-busy={pending}
    >
      {pending && <span className="spinner" aria-hidden="true" />}
      {pending ? `${label}…` : label}
    </button>
  );
}
export function TxFeedback({ id }: { id: string }) {
  const { txs, runtime, wallet, checkPending } = usePulse();
  const tx = txs[id];
  return (
    <div
      className={`tx-feedback ${tx?.phase === "error" ? "error" : ""}`}
      role="status"
      aria-live="polite"
    >
      {tx && (
        <>
          <p>{tx.message}</p>
          {tx.account && tx.account !== wallet.account && (
            <p className="small">
              For wallet{" "}
              <span className="mono">
                {tx.account.slice(0, 8)}…{tx.account.slice(-4)}
              </span>
            </p>
          )}
          {tx.hash && (
            <a
              href={`${runtime?.manifest.network.explorer}/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction ↗
            </a>
          )}
          {tx.phase === "pending" && tx.canCheck && (
            <button
              className="text-button"
              onClick={() => void checkPending(id)}
            >
              Check confirmation
            </button>
          )}
        </>
      )}
    </div>
  );
}
export function AddressView({
  address,
  label,
  compact = false,
}: {
  address: Address;
  label: string;
  compact?: boolean;
}) {
  const { runtime } = usePulse();
  const [copied, setCopied] = useState(false);
  const [failure, setFailure] = useState(false);
  const checksummed = getAddress(address);
  return (
    <span className="address-group">
      <a
        className="address mono"
        href={`${runtime?.manifest.network.explorer}/address/${checksummed}`}
        title={checksummed}
        target="_blank"
        rel="noreferrer"
        aria-label={`${label}: ${checksummed}. View on explorer`}
      >
        <bdi>
          {compact
            ? `${checksummed.slice(0, 6)}…${checksummed.slice(-4)}`
            : checksummed}
        </bdi>
        <span aria-hidden="true"> ↗</span>
      </a>
      <button
        className="copy-button"
        aria-label={`Copy ${label} address`}
        onClick={() => {
          void navigator.clipboard
            .writeText(checksummed)
            .then(() => {
              setCopied(true);
              setFailure(false);
            })
            .catch(() => setFailure(true));
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {failure && <span role="status">Select the address to copy it.</span>}
    </span>
  );
}
const artCache = new Map<string, Promise<string>>();
export function decodeArt(uri: string, pause: boolean): string {
  if (!uri.startsWith("data:application/json;base64,"))
    throw new Error("Unsupported metadata format.");
  const metadata = JSON.parse(atob(uri.split(",")[1]));
  if (
    typeof metadata.image !== "string" ||
    !metadata.image.startsWith("data:image/svg+xml;base64,")
  )
    throw new Error("Unsupported onchain image format.");
  if (!pause) return metadata.image;
  // SVG is displayed only in an isolated image. Strip animation for pause/reduced motion.
  const svg = atob(metadata.image.split(",")[1]).replace(
    /<animate\b[^>]*(?:\/>|>[\s\S]*?<\/animate>)/g,
    "",
  );
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
export function DroneArt({ drone, paused }: { drone: Drone; paused: boolean }) {
  const { runtime, client, snapshot } = usePulse();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [uri, setUri] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const key = `${drone.tokenId}-${drone.lastBeatAt}-${drone.staked}-${drone.alive}`;
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !runtime || !client) return;
    let active = true;
    setError("");
    if (!artCache.has(key))
      artCache.set(
        key,
        client.readContract({
          address: runtime.drone.address,
          abi: runtime.abis.PulseDrone,
          functionName: "tokenURI",
          args: [drone.tokenId],
          blockNumber: snapshot?.block,
        }) as Promise<string>,
      );
    artCache
      .get(key)!
      .then((value) => {
        if (active) setUri(decodeArt(value, paused));
      })
      .catch((e) => {
        artCache.delete(key);
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [
    visible,
    runtime,
    client,
    key,
    paused,
    retry,
    drone.tokenId,
    snapshot?.block,
  ]);
  return (
    <div className="drone-art" ref={ref}>
      {uri ? (
        <img
          src={uri}
          alt={`${callSign(drone.tokenId)}, fully onchain Drone artwork`}
          width="512"
          height="512"
          loading="lazy"
        />
      ) : (
        <div className="art-placeholder">
          <PulseMark />
          {error ? (
            <>
              <p>Art could not load.</p>
              <button
                className="text-button"
                onClick={() => setRetry((n) => n + 1)}
              >
                Retry artwork
              </button>
            </>
          ) : (
            <span>Reading onchain art…</span>
          )}
        </div>
      )}
    </div>
  );
}
export function DroneIllustration() {
  return (
    <svg
      className="hero-drone"
      viewBox="0 0 500 500"
      role="img"
      aria-label="Illustration of a gold hexagonal Drone with two illuminated eyes"
    >
      <defs>
        <radialGradient id="halo">
          <stop stopColor="#ab7423" stopOpacity=".23" />
          <stop offset="1" stopColor="#ab7423" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="shell" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#dcb163" />
          <stop offset=".45" stopColor="#7c5a2c" />
          <stop offset="1" stopColor="#ba8a43" />
        </linearGradient>
      </defs>
      <circle cx="250" cy="250" r="240" fill="url(#halo)" />
      <g fill="none" stroke="#e7b85a">
        <circle cx="250" cy="250" r="210" opacity=".16" />
        <circle cx="250" cy="250" r="179" strokeDasharray="2 10" opacity=".3" />
        <path d="M250 27V65M250 435v38M27 250h38m370 0h38" opacity=".5" />
        <path d="m250 83 145 84v166l-145 84-145-84V167Z" opacity=".2" />
        <path d="m250 102 129 74v148l-129 74-129-74V176Z" opacity=".5" />
      </g>
      <path
        d="m250 127 107 62v122l-107 62-107-62V189Z"
        fill="#33291b"
        stroke="#e7b85a"
        strokeWidth="2"
      />
      <path d="m250 137 98 57v112l-98 57-98-57V194Z" fill="url(#shell)" />
      <path
        d="m250 151 86 49v100l-86 49-86-49V200Z"
        fill="none"
        stroke="#f4d79a"
        opacity=".5"
      />
      <path
        d="M167 229h166v47H167Z"
        fill="#15150f"
        stroke="#edc679"
        strokeOpacity=".4"
      />
      <g fill="#f9e4a4">
        <rect x="195" y="245" width="36" height="9" rx="4.5" />
        <rect x="269" y="245" width="36" height="9" rx="4.5" />
      </g>
      <g stroke="#f6d793" strokeWidth="2" fill="none">
        <path d="m235 301 30 30m0-30-30 30m-3-23 10-10m16 36 10-10" />
      </g>
      <g fill="#e7b85a">
        <circle cx="250" cy="40" r="3" />
        <circle cx="460" cy="250" r="3" />
        <circle cx="250" cy="460" r="3" />
        <circle cx="40" cy="250" r="3" />
      </g>
    </svg>
  );
}
