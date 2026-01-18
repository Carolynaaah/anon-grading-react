import { useEffect, useMemo, useState } from "react";
import "./styles.css";

const LS_KEY = "anon_grading_db_v1";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function nowMs() {
  return Date.now();
}
function clamp2Decimals(num) {
  return Math.round(num * 100) / 100;
}
function isValidGrade(x) {
  if (Number.isNaN(x)) return false;
  if (x < 1 || x > 10) return false;
  const s = x.toString();
  if (!s.includes(".")) return true;
  return s.split(".")[1].length <= 2;
}
function formatDT(ms) {
  return new Date(ms).toLocaleString();
}
function byId(list, id) {
  return list.find((x) => x.id === id);
}

function loadDB() {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) return JSON.parse(raw);
  const db = { users: [], projects: [], deliverables: [], grades: [], session: null };
  localStorage.setItem(LS_KEY, JSON.stringify(db));
  return db;
}
function saveDB(db) {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}

function parseTeamUsernames(raw) {
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(list));
}
function userByUsername(db, username) {
  return db.users.find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
}
function isUserInTeam(project, username) {
  return project.teamUsernames.some((u) => u.toLowerCase() === username.toLowerCase());
}
function eligibleEvaluatorsForDeliverable(db, deliverable) {
  const project = byId(db.projects, deliverable.projectId);
  if (!project) return [];
  return db.users.filter((u) => u.role === "student" && !isUserInTeam(project, u.username));
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function assignJuryIfDue(db, deliverable) {
  if (nowMs() < deliverable.dueAt) return;

  if (!Array.isArray(deliverable.juryUserIds)) deliverable.juryUserIds = [];
  const eligible = eligibleEvaluatorsForDeliverable(db, deliverable);
  const wanted = Math.max(3, Number(deliverable.jurySize) || 3);

  const already = new Set(deliverable.juryUserIds);
  const candidates = eligible.filter((u) => !already.has(u.id));

  const needed = wanted - deliverable.juryUserIds.length;
  if (needed <= 0) return;

  const added = shuffle(candidates)
    .slice(0, Math.min(needed, candidates.length))
    .map((u) => u.id);

  deliverable.juryUserIds.push(...added);
}
function canEditGrade(deliverable) {
  const end = deliverable.dueAt + deliverable.editWindowMin * 60 * 1000;
  return nowMs() <= end;
}
function getGradesForDeliverable(db, deliverableId) {
  return db.grades.filter((g) => g.deliverableId === deliverableId);
}
function computeFinalGradeFromValues(values) {
  if (values.length < 3) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, sorted.length - 1);
  const avg = trimmed.reduce((s, x) => s + x, 0) / trimmed.length;
  return clamp2Decimals(avg);
}

export default function App() {
  const [db, setDb] = useState(() => loadDB());

  const user = useMemo(() => {
    if (!db.session) return null;
    return byId(db.users, db.session.userId) || null;
  }, [db]);

  // Fill juries when due (and when new users register later)
  useEffect(() => {
    const t = setInterval(() => {
      const db2 = loadDB();
      let changed = false;

      for (const d of db2.deliverables) {
        const wanted = Math.max(3, Number(d.jurySize) || 3);
        const current = (d.juryUserIds || []).length;
        if (nowMs() >= d.dueAt && current < wanted) {
          assignJuryIfDue(db2, d);
          changed = true;
        }
      }

      if (changed) {
        saveDB(db2);
        setDb(db2);
      }
    }, 5000);

    return () => clearInterval(t);
  }, []);

  // Also ensure juries are assigned on load
  useEffect(() => {
    const db2 = loadDB();
    let changed = false;
    for (const d of db2.deliverables) {
      const before = (d.juryUserIds || []).length;
      assignJuryIfDue(db2, d);
      const after = (d.juryUserIds || []).length;
      if (after !== before) changed = true;
    }
    if (changed) {
      saveDB(db2);
      setDb(db2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    const db2 = loadDB();
    db2.session = null;
    saveDB(db2);
    setDb(db2);
  }

  function resetAll() {
    if (!confirm("Reset EVERYTHING from localStorage?")) return;
    localStorage.removeItem(LS_KEY);
    setDb(loadDB());
  }

  function login(username) {
    const db2 = loadDB();
    const u = userByUsername(db2, username);
    if (!u) return alert("No such user. Register first.");
    db2.session = { userId: u.id };
    saveDB(db2);
    setDb(db2);
  }

  function register(username, role) {
    const db2 = loadDB();
    if (!username.trim()) return alert("Username required.");
    if (userByUsername(db2, username)) return alert("Username already exists.");

    const u = { id: uid("u"), username: username.trim(), role };
    db2.users.push(u);
    db2.session = { userId: u.id };
    saveDB(db2);
    setDb(db2);
  }

  function createProject(title, teamRaw) {
    const me = user;
    if (!me || me.role !== "student") return;

    const t = title.trim();
    const team = parseTeamUsernames(teamRaw || "");

    if (!t) return alert("Project title required.");
    if (team.length === 0) return alert("Team must have at least 1 username.");
    if (!team.some((x) => x.toLowerCase() === me.username.toLowerCase())) {
      return alert("Your username must be included in the team (so you are PM).");
    }

    const db2 = loadDB();
    for (const name of team) {
      const u = userByUsername(db2, name);
      if (!u) return alert(`Team member "${name}" is not registered yet.`);
      if (u.role !== "student") return alert(`"${name}" is not a student user.`);
    }

    db2.projects.push({ id: uid("p"), title: t, teamUsernames: team, createdBy: me.id });
    saveDB(db2);
    setDb(db2);
  }

  function createDeliverable(projectId, title, dueStr, jurySize, editWindowMin) {
    const me = user;
    if (!me || me.role !== "student") return;

    const db2 = loadDB();
    const project = byId(db2.projects, projectId);
    if (!project) return alert("Select a valid project first.");
    if (!isUserInTeam(project, me.username)) return alert("Only PM team can create deliverables.");

    const t = title.trim();
    if (!t) return alert("Deliverable title required.");
    if (!dueStr) return alert("Due date required.");
    const dueAt = new Date(dueStr).getTime();
    if (Number.isNaN(dueAt)) return alert("Invalid due date.");

    const js = Number(jurySize);
    const ew = Number(editWindowMin);

    if (!Number.isFinite(js) || js < 3) return alert("Jury size must be at least 3.");
    if (!Number.isFinite(ew) || ew < 1) return alert("Edit window must be >= 1 minute.");

    db2.deliverables.push({
      id: uid("d"),
      projectId,
      title: t,
      dueAt,
      jurySize: js,
      editWindowMin: ew,
      link: "",
      juryUserIds: [],
    });

    saveDB(db2);
    setDb(db2);
  }

  function saveDeliverableLink(deliverableId, link) {
    const db2 = loadDB();
    const d = byId(db2.deliverables, deliverableId);
    if (!d) return;
    const proj = byId(db2.projects, d.projectId);
    const me = byId(db2.users, db2.session?.userId);
    if (!proj || !me) return;

    if (!isUserInTeam(proj, me.username)) return alert("Only PM team members can update links.");

    d.link = (link || "").trim();
    saveDB(db2);
    setDb(db2);
  }

  function submitGrade(deliverableId, value) {
    const db2 = loadDB();
    const me = byId(db2.users, db2.session?.userId);
    const d = byId(db2.deliverables, deliverableId);
    if (!me || !d) return;

    if (!(d.juryUserIds || []).includes(me.id)) return alert("Only jury members can grade this deliverable.");
    if (!canEditGrade(d)) return alert("Editing time expired for this deliverable.");

    const val = clamp2Decimals(Number(value));
    if (!isValidGrade(val)) return alert("Invalid grade. Must be between 1 and 10, with at most 2 decimals.");

    let g = db2.grades.find((x) => x.deliverableId === deliverableId && x.evaluatorId === me.id);
    if (!g) {
      g = { id: uid("g"), deliverableId, evaluatorId: me.id, value: val, createdAt: nowMs(), updatedAt: nowMs() };
      db2.grades.push(g);
    } else {
      g.value = val;
      g.updatedAt = nowMs();
    }

    saveDB(db2);
    setDb(db2);
  }

  return (
    <>
      <header className="topbar">
        <h1>Anonymous Grading</h1>
        <div className="session">
          {!user ? (
            <span className="badge">Not logged in</span>
          ) : (
            <>
              <span className="badge">
                Logged in: {user.username} ({user.role})
              </span>
              <button className="secondary" onClick={logout}>
                Logout
              </button>
              <button className="danger" onClick={resetAll}>
                Reset Demo Data
              </button>
            </>
          )}
        </div>
      </header>

      <main className="container">
        {!user ? (
          <AuthView onRegister={register} onLogin={login} />
        ) : user.role === "student" ? (
          <StudentView
            db={db}
            user={user}
            onCreateProject={createProject}
            onCreateDeliverable={createDeliverable}
            onSaveLink={saveDeliverableLink}
            onSubmitGrade={submitGrade}
          />
        ) : (
          <ProfessorView db={db} />
        )}
      </main>
    </>
  );
}

function AuthView({ onRegister, onLogin }) {
  const [regUsername, setRegUsername] = useState("");
  const [regRole, setRegRole] = useState("student");
  const [loginUsername, setLoginUsername] = useState("");

  return (
    <section className="card">
      <h2>Login / Register</h2>

      <div className="grid2">
        <div>
          <h3>Register</h3>
          <label>
            Username
            <input value={regUsername} onChange={(e) => setRegUsername(e.target.value)} placeholder="e.g. ana" />
          </label>
          <label>
            Role
            <select value={regRole} onChange={(e) => setRegRole(e.target.value)}>
              <option value="student">Student</option>
              <option value="professor">Professor</option>
            </select>
          </label>
          <button onClick={() => onRegister(regUsername, regRole)}>Register</button>
          <p className="hint">Students are automatically eligible evaluators (unless PM of a project).</p>
        </div>

        <div>
          <h3>Login</h3>
          <label>
            Username
            <input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder="e.g. ana" />
          </label>
          <button onClick={() => onLogin(loginUsername)}>Login</button>
          <p className="hint">No passwords in this demo (simple).</p>
        </div>
      </div>
    </section>
  );
}

function StudentView({ db, user, onCreateProject, onCreateDeliverable, onSaveLink, onSubmitGrade }) {
  const [projTitle, setProjTitle] = useState("");
  const [projTeam, setProjTeam] = useState("");

  const myProjects = useMemo(() => db.projects.filter((p) => isUserInTeam(p, user.username)), [db, user]);

  const [deliverableProjectId, setDeliverableProjectId] = useState(myProjects[0]?.id || "");
  useEffect(() => setDeliverableProjectId(myProjects[0]?.id || ""), [myProjects]);

  const [delTitle, setDelTitle] = useState("");
  const [delDue, setDelDue] = useState("");
  const [delJurySize, setDelJurySize] = useState(5);
  const [delEditWindow, setDelEditWindow] = useState(30);

  const juryTasks = useMemo(() => db.deliverables.filter((d) => (d.juryUserIds || []).includes(user.id)), [db, user]);

  return (
    <section className="card">
      <h2>Student Dashboard</h2>

      <div className="grid2">
        <div className="subcard">
          <h3>Create Project (PM)</h3>
          <label>
            Project title
            <input value={projTitle} onChange={(e) => setProjTitle(e.target.value)} placeholder="My Web App" />
          </label>
          <label>
            Team members (comma separated usernames)
            <input value={projTeam} onChange={(e) => setProjTeam(e.target.value)} placeholder="ana, bogdan" />
          </label>
          <button
            onClick={() => {
              onCreateProject(projTitle, projTeam);
              setProjTitle("");
              setProjTeam("");
            }}
          >
            Create Project
          </button>
          <p className="hint">If you create a project and include yourself, you are PM (part of that team).</p>
        </div>

        <div className="subcard">
          <h3>Create Deliverable</h3>
          <label>
            Select project
            <select value={deliverableProjectId} onChange={(e) => setDeliverableProjectId(e.target.value)}>
              {myProjects.length === 0 ? (
                <option value="">No projects yet (create one first)</option>
              ) : (
                myProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            Deliverable title
            <input value={delTitle} onChange={(e) => setDelTitle(e.target.value)} placeholder="Milestone 1" />
          </label>
          <label>
            Due date/time (local)
            <input value={delDue} onChange={(e) => setDelDue(e.target.value)} type="datetime-local" />
          </label>
          <label>
            Jury size
            <input value={delJurySize} onChange={(e) => setDelJurySize(e.target.value)} type="number" min="3" max="10" />
          </label>
          <label>
            Edit window (minutes after due)
            <input value={delEditWindow} onChange={(e) => setDelEditWindow(e.target.value)} type="number" min="1" max="1440" />
          </label>
          <button
            onClick={() => {
              onCreateDeliverable(deliverableProjectId, delTitle, delDue, delJurySize, delEditWindow);
              setDelTitle("");
              setDelDue("");
            }}
          >
            Add Deliverable
          </button>
          <p className="hint">Grades can be edited only until (due + edit window).</p>
        </div>
      </div>

      <div className="subcard">
        <h3>Projects & Deliverables</h3>
        {myProjects.length === 0 ? (
          <p className="small">You are not PM in any project yet.</p>
        ) : (
          myProjects.map((p) => (
            <div className="subcard" key={p.id}>
              <div className="row">
                <strong>{p.title}</strong>
                <span className="badge">Team: {p.teamUsernames.join(", ")}</span>
              </div>

              {db.deliverables.filter((d) => d.projectId === p.id).length === 0 ? (
                <p className="small">No deliverables yet.</p>
              ) : (
                db.deliverables
                  .filter((d) => d.projectId === p.id)
                  .map((d) => <DeliverablePMCard key={d.id} d={d} onSaveLink={onSaveLink} />)
              )}
            </div>
          ))
        )}
      </div>

      <div className="subcard">
        <h3>Jury Tasks (Deliverables I can grade)</h3>
        {juryTasks.length === 0 ? (
          <p className="small">No deliverables assigned to you as jury.</p>
        ) : (
          juryTasks.map((d) => <JuryTaskCard key={d.id} db={db} d={d} user={user} onSubmitGrade={onSubmitGrade} />)
        )}
      </div>
    </section>
  );
}

function DeliverablePMCard({ d, onSaveLink }) {
  const [link, setLink] = useState(d.link || "");
  useEffect(() => setLink(d.link || ""), [d.link]);

  return (
    <div className="subcard">
      <div className="row">
        <strong>{d.title}</strong>
        <span className="badge">Due: {formatDT(d.dueAt)}</span>
        <span className="badge">
          Jury: {(d.juryUserIds || []).length}/{d.jurySize}
        </span>
        <span className="badge">Edit window: {d.editWindowMin} min</span>
      </div>

      <p className="small">Jury assignment: automatic at due time</p>

      <div className="row" style={{ marginTop: 8 }}>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Video or deployed link (https://...)" />
        <button className="secondary" onClick={() => onSaveLink(d.id, link)}>
          Save link
        </button>
      </div>

      <div className="hr"></div>
    </div>
  );
}

function JuryTaskCard({ db, d, user, onSubmitGrade }) {
  const project = byId(db.projects, d.projectId);
  const myGrade = db.grades.find((g) => g.deliverableId === d.id && g.evaluatorId === user.id) || null;
  const editable = canEditGrade(d);
  const status = editable ? "Editing allowed" : "Editing closed";

  const [grade, setGrade] = useState(myGrade ? String(myGrade.value) : "");
  useEffect(() => setGrade(myGrade ? String(myGrade.value) : ""), [myGrade?.value]);

  return (
    <div className="subcard">
      <div className="row">
        <strong>{project ? project.title : "Unknown project"}</strong>
        <span className="badge">{d.title}</span>
        <span className="badge">{status}</span>
      </div>

      <p className="small">
        Link:{" "}
        {d.link ? (
          <a href={d.link} target="_blank" rel="noreferrer">
            {d.link}
          </a>
        ) : (
          <em>no link yet</em>
        )}
      </p>

      <div className="row">
        <label style={{ flex: 1 }}>
          Your grade (1-10, max 2 decimals)
          <input value={grade} onChange={(e) => setGrade(e.target.value)} type="number" min="1" max="10" step="0.01" />
        </label>
        <button disabled={!editable} onClick={() => onSubmitGrade(d.id, grade)}>
          {myGrade ? "Update grade" : "Submit grade"}
        </button>
      </div>

      <p className="hint mono">You can only edit your own grade, until: {formatDT(d.dueAt + d.editWindowMin * 60 * 1000)}</p>
    </div>
  );
}

function ProfessorView({ db }) {
  return (
    <section className="card">
      <h2>Professor Dashboard</h2>
      <p className="hint">You can see results per project, but NOT the jury identities.</p>

      {db.projects.length === 0 ? (
        <p className="small">No projects yet.</p>
      ) : (
        db.projects.map((p) => (
          <div className="subcard" key={p.id}>
            <div className="row">
              <strong>{p.title}</strong>
              <span className="badge">Team: {p.teamUsernames.join(", ")}</span>
            </div>

            {db.deliverables.filter((d) => d.projectId === p.id).length === 0 ? (
              <p className="small">No deliverables.</p>
            ) : (
              db.deliverables
                .filter((d) => d.projectId === p.id)
                .map((d) => {
                  const grades = getGradesForDeliverable(db, d.id);
                  const values = grades.map((g) => Number(g.value)).filter((x) => !Number.isNaN(x));
                  const final = computeFinalGradeFromValues(values);

                  return (
                    <div className="subcard" key={d.id}>
                      <div className="row">
                        <strong>{d.title}</strong>
                        <span className="badge">Due: {formatDT(d.dueAt)}</span>
                        <span className="badge">Grades: {values.length}/{(d.juryUserIds || []).length}</span>
                      </div>

                      <p className="small">
                        Link:{" "}
                        {d.link ? (
                          <a href={d.link} target="_blank" rel="noreferrer">
                            {d.link}
                          </a>
                        ) : (
                          <em>no link</em>
                        )}
                      </p>

                      <p className="small">
                        Submitted grade values (anonymous): <span className="mono">{values.length ? values.join(", ") : "none"}</span>
                      </p>

                      <p className="small">
                        <strong>Final grade (drop min & max):</strong>{" "}
                        {final === null ? <em>need at least 3 grades</em> : final}
                      </p>
                    </div>
                  );
                })
            )}
          </div>
        ))
      )}
    </section>
  );
}
