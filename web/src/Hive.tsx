import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { usePulse } from "./store";
import { callSign, castes, ranks, timing, units } from "./domain";
import { AddressView, DroneArt, SectionHeading } from "./components";
export function Hive({ paused }: { paused: boolean }) {
  const { snapshot, now, loading, progress } = usePulse();
  const [filter, setFilter] = useState("all");
  const [caste, setCaste] = useState("all");
  const [shown, setShown] = useState(12);
  const [leaderboard, setLeaderboard] = useState<"streak" | "stake">("streak");
  const [leadersShown, setLeadersShown] = useState(10);
  const filtered = useMemo(
    () =>
      (snapshot?.drones ?? []).filter(
        (d) =>
          (filter === "all" || timing(d, now).alive === (filter === "alive")) &&
          (caste === "all" || d.caste === Number(caste)),
      ),
    [snapshot, filter, caste, now],
  );
  const leaders = useMemo(
    () =>
      [...(snapshot?.drones ?? [])]
        .filter((d) => leaderboard === "stake" || timing(d, now).alive)
        .sort((a, b) => {
          const aValue = leaderboard === "stake" ? a.staked : a.streak;
          const bValue = leaderboard === "stake" ? b.staked : b.streak;
          return aValue > bValue
            ? -1
            : aValue < bValue
              ? 1
              : Number(a.tokenId - b.tokenId);
        })
        .slice(0, 50),
    [snapshot, leaderboard, now],
  );
  return (
    <section id="hive" className="section">
      <SectionHeading
        number="03"
        title="Meet the Hive"
        text="Thousands of individual signals. One living swarm."
      >
        <span className="tag">
          {snapshot ? `${snapshot.total} / 4,096 minted` : "Reading the Hive"}
        </span>
      </SectionHeading>
      <div className="hive-controls">
        <div className="segmented" aria-label="Filter by status">
          {["all", "alive", "dormant"].map((item) => (
            <button
              key={item}
              aria-pressed={filter === item}
              onClick={() => {
                setFilter(item);
                setShown(12);
              }}
            >
              {item === "all"
                ? "All Drones"
                : item === "alive"
                  ? "Alive"
                  : "Dormant"}
            </button>
          ))}
        </div>
        <div className="caste-select">
          <label htmlFor="caste">Caste</label>
          <select
            id="caste"
            value={caste}
            onChange={(e) => {
              setCaste(e.target.value);
              setShown(12);
            }}
          >
            <option value="all">All Castes</option>
            {castes.map((c, i) => (
              <option key={c} value={i}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!snapshot ? (
        <div className="empty-state">
          <h3>
            {loading ? "Listening to the swarm…" : "The Hive is unavailable."}
          </h3>
          <p>
            {loading
              ? `Reading contract state${progress.total ? `: ${progress.loaded} of ${progress.total} Drones` : ""}.`
              : "Use Refresh data above to reconnect to the network."}
          </p>
        </div>
      ) : !snapshot.total ? (
        <div className="empty-state">
          <span className="eyebrow">The first signal could be yours</span>
          <h3>The Hive is waiting.</h3>
          <p>No Drones have been minted yet.</p>
          <a className="button" href="#my-drone">
            Mint the first Drone ↗
          </a>
        </div>
      ) : !filtered.length ? (
        <div className="empty-state">
          <h3>No Drones match these filters.</h3>
          <button
            className="button"
            onClick={() => {
              setFilter("all");
              setCaste("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <p className="small muted" role="status">
            Showing {Math.min(shown, filtered.length)} of {filtered.length}{" "}
            matching Drones
          </p>
          <div className="drone-grid">
            {filtered.slice(0, shown).map((drone) => (
              <article className="drone-card" key={drone.tokenId.toString()}>
                <DroneArt drone={drone} paused={paused} />
                <div className="drone-card-content">
                  <div className="row">
                    <h3 className="mono">{callSign(drone.tokenId)}</h3>
                    <span
                      className={`status ${timing(drone, now).alive ? "alive" : ""}`}
                    >
                      {timing(drone, now).alive ? "● Alive" : "○ Dormant"}
                    </span>
                  </div>
                  <p>
                    {castes[drone.caste]} · {ranks[drone.rank]}
                  </p>
                  <div className="data-row">
                    <span>{drone.streak.toString()} beat streak</span>
                    <span title={formatUnits(drone.staked, 18)}>
                      {units(drone.staked)} PULSE
                    </span>
                  </div>
                  <AddressView
                    address={drone.owner}
                    label={`${callSign(drone.tokenId)} owner`}
                    compact
                  />
                </div>
              </article>
            ))}
          </div>
          {shown < filtered.length && (
            <button
              className="button load-more"
              onClick={() => setShown((n) => n + 12)}
            >
              Load more Drones ↓
            </button>
          )}
        </>
      )}
      <div className="leaderboard panel">
        <div className="leaderboard-heading">
          <div>
            <p className="eyebrow">Signals that stand out</p>
            <h3>Hive leaderboard</h3>
          </div>
          <div className="segmented" aria-label="Leaderboard ranking">
            <button
              aria-pressed={leaderboard === "streak"}
              onClick={() => {
                setLeaderboard("streak");
                setLeadersShown(10);
              }}
            >
              Active streak
            </button>
            <button
              aria-pressed={leaderboard === "stake"}
              onClick={() => {
                setLeaderboard("stake");
                setLeadersShown(10);
              }}
            >
              Staked PULSE
            </button>
          </div>
        </div>
        <p className="small muted">
          Top 50 across the complete Hive.{" "}
          {leaderboard === "streak"
            ? "Only Alive Drones qualify for the active streak ranking."
            : "Includes Alive and Dormant Drones."}{" "}
          Ties use the lower token ID.
        </p>
        {leaders.length ? (
          <>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">
                  Top Drones by{" "}
                  {leaderboard === "streak" ? "active streak" : "staked PULSE"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Drone</th>
                    <th scope="col">Caste</th>
                    <th scope="col">
                      {leaderboard === "streak" ? "Streak" : "Staked PULSE"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.slice(0, leadersShown).map((drone, i) => (
                    <tr key={drone.tokenId.toString()}>
                      <td className="mono muted">
                        {String(i + 1).padStart(2, "0")}
                      </td>
                      <th scope="row" className="mono">
                        {callSign(drone.tokenId)}
                      </th>
                      <td>{castes[drone.caste]}</td>
                      <td
                        className="mono"
                        title={
                          leaderboard === "stake"
                            ? formatUnits(drone.staked, 18)
                            : undefined
                        }
                      >
                        {leaderboard === "streak"
                          ? `${drone.streak} beats`
                          : units(drone.staked)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {leadersShown < leaders.length && (
              <button
                className="text-button"
                onClick={() => setLeadersShown(50)}
              >
                Show all {leaders.length} leaders ↓
              </button>
            )}
          </>
        ) : (
          <p className="muted">
            {snapshot
              ? "No qualifying Drones yet. Start a heartbeat to join the Hive."
              : "Waiting for a complete live snapshot."}
          </p>
        )}
      </div>
    </section>
  );
}
