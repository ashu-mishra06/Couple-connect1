import React, { useEffect, useMemo, useRef, useState } from "react";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";

function cleanId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
}

async function sha256(text) {
  const data = new TextEncoder().encode(String(text));
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatTime(value) {
  if (!value) return "—";
  if (value?.toDate) return value.toDate().toLocaleString();
  if (value?.seconds) return new Date(value.seconds * 1000).toLocaleString();
  return new Date(value).toLocaleString();
}

function timeToMs(value) {
  if (!value) return 0;
  if (value?.toDate) return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  return new Date(value).getTime();
}

function resizeImageToBase64(fileOrDataUrl, maxSize = 720, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * ratio);
      canvas.height = Math.round(image.height * ratio);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    image.onerror = reject;

    if (typeof fileOrDataUrl === "string") {
      image.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        image.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("signin");
  const [setupMode, setSetupMode] = useState("create");
  const [page, setPage] = useState("home");
  const [toast, setToast] = useState("");

  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [profile, setProfile] = useState(null);
  const [couple, setCouple] = useState(null);

  const [createForm, setCreateForm] = useState({
    coupleId: "",
    sharedPassword: "",
    profileAName: "Ashu",
    profileBName: "Partner",
    profileKey: "profileA"
  });

  const [joinForm, setJoinForm] = useState({
    coupleId: "",
    sharedPassword: "",
    profileKey: "profileB"
  });

  const [partnerStatus, setPartnerStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [snaps, setSnaps] = useState([]);
  const [locations, setLocations] = useState([]);

  const [statusText, setStatusText] = useState("");
  const [messageText, setMessageText] = useState("");
  const [locationOn, setLocationOn] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const locationWatchRef = useRef(null);

  const partnerKey = profile?.profileKey === "profileA" ? "profileB" : "profileA";
  const meName = useMemo(() => {
    if (!profile || !couple) return "Profile";
    return profile.profileKey === "profileA" ? couple.profileAName : couple.profileBName;
  }, [profile, couple]);

  const partnerName = useMemo(() => {
    if (!profile || !couple) return "Partner";
    return profile.profileKey === "profileA" ? couple.profileBName : couple.profileAName;
  }, [profile, couple]);

  function notify(message) {
    setToast(message);
    setTimeout(() => setToast(""), 3200);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setCouple(null);
        return;
      }

      const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
      if (!userSnap.exists()) {
        setProfile(null);
        setCouple(null);
        return;
      }

      const userData = userSnap.data();
      setProfile(userData);

      if (userData.coupleId) {
        const coupleSnap = await getDoc(doc(db, "couples", userData.coupleId));
        setCouple(coupleSnap.exists() ? coupleSnap.data() : null);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!profile?.coupleId || !partnerKey) return;

    const unsubscribers = [
      onSnapshot(doc(db, "couples", profile.coupleId, "statuses", partnerKey), (snap) => {
        setPartnerStatus(snap.exists() ? snap.data() : null);
      }),
      onSnapshot(
        query(collection(db, "couples", profile.coupleId, "messages"), orderBy("createdAt", "asc"), limit(100)),
        (snapshot) => setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
      ),
      onSnapshot(
        query(collection(db, "couples", profile.coupleId, "snaps"), orderBy("createdAt", "desc"), limit(25)),
        (snapshot) => setSnaps(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
      ),
      onSnapshot(
        query(collection(db, "couples", profile.coupleId, "locations"), orderBy("createdAt", "desc"), limit(100)),
        (snapshot) => setLocations(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
      )
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [profile?.coupleId, partnerKey]);

  async function signUp(event) {
    event.preventDefault();
    try {
      await createUserWithEmailAndPassword(auth, authForm.email.trim(), authForm.password);
      notify("Account created. Now create or join your couple space.");
    } catch (error) {
      notify(error.message);
    }
  }

  async function signIn(event) {
    event.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, authForm.email.trim(), authForm.password);
      notify("Signed in.");
    } catch (error) {
      notify(error.message);
    }
  }

  async function createCouple(event) {
    event.preventDefault();

    if (!user) return notify("Login first.");

    const coupleId = cleanId(createForm.coupleId);
    if (!coupleId) return notify("Enter a valid Couple ID.");
    if (createForm.sharedPassword.length < 4) return notify("Shared password must be at least 4 characters.");

    const coupleRef = doc(db, "couples", coupleId);
    const existing = await getDoc(coupleRef);
    if (existing.exists()) return notify("This Couple ID already exists.");

    const passwordHash = await sha256(createForm.sharedPassword);

    const coupleData = {
      coupleId,
      couplePasswordHash: passwordHash,
      profileAName: createForm.profileAName || "Profile A",
      profileBName: createForm.profileBName || "Profile B",
      members: [user.uid],
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(coupleRef, coupleData);

    const userData = {
      uid: user.uid,
      email: user.email,
      coupleId,
      profileKey: createForm.profileKey,
      createdAt: serverTimestamp()
    };

    await setDoc(doc(db, "users", user.uid), userData);
    setProfile(userData);
    setCouple(coupleData);
    notify("Couple space created.");
  }

  async function joinCouple(event) {
    event.preventDefault();

    if (!user) return notify("Login first.");

    const coupleId = cleanId(joinForm.coupleId);
    const coupleRef = doc(db, "couples", coupleId);
    const coupleSnap = await getDoc(coupleRef);

    if (!coupleSnap.exists()) return notify("Couple ID not found.");

    const coupleData = coupleSnap.data();
    const passwordHash = await sha256(joinForm.sharedPassword);

    if (coupleData.couplePasswordHash !== passwordHash) {
      return notify("Wrong shared couple password.");
    }

    const members = Array.from(new Set([...(coupleData.members || []), user.uid])).slice(0, 2);

    await updateDoc(coupleRef, {
      members,
      updatedAt: serverTimestamp()
    });

    const userData = {
      uid: user.uid,
      email: user.email,
      coupleId,
      profileKey: joinForm.profileKey,
      createdAt: serverTimestamp()
    };

    await setDoc(doc(db, "users", user.uid), userData);
    setProfile(userData);
    setCouple({ ...coupleData, members });
    notify("Joined couple space.");
  }

  async function shareStatus() {
    const text = statusText.trim();
    if (!text) return notify("Write your status first.");

    await setDoc(doc(db, "couples", profile.coupleId, "statuses", profile.profileKey), {
      text,
      sender: profile.profileKey,
      senderName: meName,
      uid: user.uid,
      createdAt: serverTimestamp()
    });

    setStatusText("");
    notify("Status shared.");
  }

  async function sendMessage(event) {
    event.preventDefault();

    const text = messageText.trim();
    if (!text) return;

    await addDoc(collection(db, "couples", profile.coupleId, "messages"), {
      text,
      sender: profile.profileKey,
      senderName: meName,
      uid: user.uid,
      createdAt: serverTimestamp()
    });

    setMessageText("");
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      cameraStreamRef.current = stream;
      videoRef.current.srcObject = stream;
      notify("Camera started.");
    } catch {
      notify("Camera permission denied or unavailable.");
    }
  }

  async function snapPhoto() {
    if (!videoRef.current?.srcObject) return notify("Start camera first.");

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    const raw = canvas.toDataURL("image/jpeg", 0.72);
    const compressed = await resizeImageToBase64(raw);
    await uploadSnap(compressed);
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      notify("Choose a photo under 5 MB.");
      return;
    }

    const compressed = await resizeImageToBase64(file);
    await uploadSnap(compressed);
    event.target.value = "";
  }

  async function uploadSnap(imageBase64) {
    await addDoc(collection(db, "couples", profile.coupleId, "snaps"), {
      imageBase64,
      sender: profile.profileKey,
      senderName: meName,
      uid: user.uid,
      createdAt: serverTimestamp()
    });

    notify("Snap shared.");
  }

  async function deleteSnap(snapId) {
    await deleteDoc(doc(db, "couples", profile.coupleId, "snaps", snapId));
  }

  function toggleLocation(enabled) {
    setLocationOn(enabled);

    if (!enabled) {
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
      notify("Location sharing stopped.");
      return;
    }

    if (!navigator.geolocation) {
      setLocationOn(false);
      notify("Location is not available in this browser.");
      return;
    }

    locationWatchRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        await addDoc(collection(db, "couples", profile.coupleId, "locations"), {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          sender: profile.profileKey,
          senderName: meName,
          uid: user.uid,
          createdAt: serverTimestamp()
        });
      },
      () => {
        setLocationOn(false);
        notify("Location permission denied.");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 15000
      }
    );

    notify("Location sharing started.");
  }

  async function logout() {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (locationWatchRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }

    await signOut(auth);
  }

  const partnerLocations = locations
    .filter((item) => item.sender === partnerKey)
    .sort((a, b) => timeToMs(b.createdAt) - timeToMs(a.createdAt));

  const latestPartnerLocation = partnerLocations[0];

  if (!user) {
    return (
      <div className="app">
        <section className="authGrid">
          <div className="intro card">
            <p className="tag">Private Web App for Two</p>
            <h1>CoupleConnect</h1>
            <p className="lead">
              A private couple dashboard with realtime status, quick photo snaps, chat, and consent-based location sharing.
            </p>
            <div className="chips">
              <span>🏠 Home Feed</span>
              <span>📸 Snap Box</span>
              <span>📍 Live Map</span>
              <span>💬 Messages</span>
            </div>
            <div className="notice">
              <strong>Privacy:</strong> location sharing is opt-in. Do not use this app for hidden tracking.
            </div>
          </div>

          <div className="authCard card">
            <div className="mode two">
              <button className={authMode === "signin" ? "active" : ""} onClick={() => setAuthMode("signin")}>Sign in</button>
              <button className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>Sign up</button>
            </div>

            <form className="form" onSubmit={authMode === "signup" ? signUp : signIn}>
              <h2>{authMode === "signup" ? "Create account" : "Sign in"}</h2>

              <label>
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  placeholder="your@email.com"
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  placeholder="Minimum 6 characters"
                  required
                />
              </label>

              <button className="primary" type="submit">
                {authMode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>
          </div>
        </section>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  if (!profile || !couple) {
    return (
      <div className="app">
        <section className="authGrid">
          <div className="intro card">
            <p className="tag">Connect Profiles</p>
            <h1>Setup</h1>
            <p className="lead">
              Create a private couple space or join using the Couple ID and shared couple password.
            </p>
            <div className="notice">Signed in as <strong>{user.email}</strong></div>
          </div>

          <div className="authCard card">
            <div className="mode two">
              <button className={setupMode === "create" ? "active" : ""} onClick={() => setSetupMode("create")}>Create</button>
              <button className={setupMode === "join" ? "active" : ""} onClick={() => setSetupMode("join")}>Join</button>
            </div>

            {setupMode === "create" ? (
              <form className="form" onSubmit={createCouple}>
                <h2>Create Couple Space</h2>

                <label>
                  Couple ID
                  <input
                    value={createForm.coupleId}
                    onChange={(e) => setCreateForm({ ...createForm, coupleId: e.target.value })}
                    placeholder="ashu-love"
                    required
                  />
                </label>

                <label>
                  Shared couple password
                  <input
                    type="password"
                    value={createForm.sharedPassword}
                    onChange={(e) => setCreateForm({ ...createForm, sharedPassword: e.target.value })}
                    placeholder="Same password for both"
                    required
                  />
                </label>

                <div className="grid2">
                  <label>
                    Profile A name
                    <input
                      value={createForm.profileAName}
                      onChange={(e) => setCreateForm({ ...createForm, profileAName: e.target.value })}
                    />
                  </label>

                  <label>
                    Profile B name
                    <input
                      value={createForm.profileBName}
                      onChange={(e) => setCreateForm({ ...createForm, profileBName: e.target.value })}
                    />
                  </label>
                </div>

                <label>
                  I am
                  <select
                    value={createForm.profileKey}
                    onChange={(e) => setCreateForm({ ...createForm, profileKey: e.target.value })}
                  >
                    <option value="profileA">Profile A</option>
                    <option value="profileB">Profile B</option>
                  </select>
                </label>

                <button className="primary" type="submit">Create</button>
              </form>
            ) : (
              <form className="form" onSubmit={joinCouple}>
                <h2>Join Existing Couple</h2>

                <label>
                  Couple ID
                  <input
                    value={joinForm.coupleId}
                    onChange={(e) => setJoinForm({ ...joinForm, coupleId: e.target.value })}
                    placeholder="ashu-love"
                    required
                  />
                </label>

                <label>
                  Shared couple password
                  <input
                    type="password"
                    value={joinForm.sharedPassword}
                    onChange={(e) => setJoinForm({ ...joinForm, sharedPassword: e.target.value })}
                    required
                  />
                </label>

                <label>
                  I am
                  <select
                    value={joinForm.profileKey}
                    onChange={(e) => setJoinForm({ ...joinForm, profileKey: e.target.value })}
                  >
                    <option value="profileA">Profile A</option>
                    <option value="profileB">Profile B</option>
                  </select>
                </label>

                <button className="primary" type="submit">Join</button>
              </form>
            )}

            <button className="danger full" onClick={logout}>Logout</button>
          </div>
        </section>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      <section className="mainGrid">
        <aside className="sidebar card">
          <div>
            <p className="tag">Logged in as</p>
            <h2>{meName}</h2>
            <p className="muted">Partner: {partnerName}</p>
          </div>

          <nav className="nav">
            <button className={page === "home" ? "active" : ""} onClick={() => setPage("home")}>🏠 Home</button>
            <button className={page === "map" ? "active" : ""} onClick={() => setPage("map")}>📍 Map</button>
            <button className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")}>⚙️ Settings</button>
          </nav>

          <button className="danger" onClick={logout}>Logout</button>
        </aside>

        <main>
          {page === "home" && (
            <section className="page">
              <div className="topGrid">
                <div className="panel card">
                  <p className="tag">Partner latest work</p>
                  <h2>{partnerStatus ? `${partnerName} is currently` : "No update yet"}</h2>
                  <p className="muted">{partnerStatus?.text || "Your partner’s current work/status will appear here."}</p>
                  <p className="small">{formatTime(partnerStatus?.createdAt)}</p>
                </div>

                <div className="panel card">
                  <p className="tag">Share your current work</p>
                  <textarea
                    value={statusText}
                    onChange={(e) => setStatusText(e.target.value)}
                    placeholder="Example: studying, gym, coding, eating, travelling..."
                  />
                  <button className="primary" onClick={shareStatus}>Share Update</button>
                </div>
              </div>

              <div className="contentGrid">
                <div className="panel card">
                  <div className="heading">
                    <div>
                      <p className="tag">Photo Snap Block</p>
                      <h2>Quick Snip</h2>
                    </div>
                    <span className="pill">Firestore</span>
                  </div>

                  <video ref={videoRef} className="camera" autoPlay playsInline muted />
                  <canvas ref={canvasRef} className="hidden" />

                  <div className="actions">
                    <button className="secondary" onClick={startCamera}>Start Camera</button>
                    <button className="primary" onClick={snapPhoto}>Snip Photo</button>
                    <label className="upload">
                      Upload Photo
                      <input type="file" accept="image/*" onChange={uploadPhoto} />
                    </label>
                  </div>

                  <p className="small">Photos are compressed before saving to Firestore.</p>
                </div>

                <div className="panel card">
                  <div className="heading">
                    <div>
                      <p className="tag">Shared Snaps</p>
                      <h2>Photo Feed</h2>
                    </div>
                  </div>

                  <div className={snaps.length ? "feed" : "feed empty"}>
                    {snaps.length ? snaps.map((snap) => (
                      <article className="snap" key={snap.id}>
                        <img src={snap.imageBase64} alt="Shared snap" />
                        <p className="small">{snap.senderName} • {formatTime(snap.createdAt)}</p>
                        {snap.uid === user.uid && (
                          <button className="smallBtn" onClick={() => deleteSnap(snap.id)}>Delete</button>
                        )}
                      </article>
                    )) : "No snaps yet."}
                  </div>
                </div>
              </div>
            </section>
          )}

          {page === "map" && (
            <section className="page">
              <div className="panel card mapControl">
                <div>
                  <p className="tag">Consent Location</p>
                  <h2>Map Section</h2>
                  <p className="muted">Turn location on only when you want to share. Your partner sees your latest shared location.</p>
                </div>

                <label className="switch">
                  <span>Share my location</span>
                  <input type="checkbox" checked={locationOn} onChange={(e) => toggleLocation(e.target.checked)} />
                </label>
              </div>

              <div className="contentGrid">
                <div className="panel card">
                  <div className="heading">
                    <h2>Partner Latest Location</h2>
                    <span className="pill">{latestPartnerLocation ? "Latest" : "Offline"}</span>
                  </div>

                  <div className="mapBox">
                    {latestPartnerLocation ? (
                      <iframe
                        title="Partner location"
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${latestPartnerLocation.lng - 0.01}%2C${latestPartnerLocation.lat - 0.01}%2C${latestPartnerLocation.lng + 0.01}%2C${latestPartnerLocation.lat + 0.01}&layer=mapnik&marker=${latestPartnerLocation.lat}%2C${latestPartnerLocation.lng}`}
                      />
                    ) : (
                      <p>No partner location shared yet.</p>
                    )}
                  </div>
                </div>

                <div className="panel card">
                  <h2>Where they went</h2>
                  <p className="muted">Recent shared partner location points.</p>

                  <div className={partnerLocations.length ? "timeline" : "timeline empty"}>
                    {partnerLocations.length ? partnerLocations.slice(0, 12).map((point) => (
                      <div className="point" key={point.id}>
                        <strong>{Number(point.lat).toFixed(5)}, {Number(point.lng).toFixed(5)}</strong>
                        <p className="small">{formatTime(point.createdAt)}</p>
                        <a className="small" href={`https://maps.google.com/?q=${point.lat},${point.lng}`} target="_blank" rel="noreferrer">Open in Google Maps</a>
                      </div>
                    )) : "No location history yet."}
                  </div>
                </div>
              </div>
            </section>
          )}

          {page === "settings" && (
            <section className="page">
              <div className="settingsGrid">
                <div className="panel card">
                  <p className="tag">Settings</p>
                  <h2>Connection Details</h2>

                  <div className="info">
                    <div><span>Couple ID</span><strong>{profile.coupleId}</strong></div>
                    <div><span>Your Profile</span><strong>{meName}</strong></div>
                    <div><span>Partner</span><strong>{partnerName}</strong></div>
                    <div><span>Email</span><strong>{user.email}</strong></div>
                    <div><span>Storage</span><strong>Firestore Base64</strong></div>
                  </div>

                  <button
                    className="secondary"
                    onClick={() => navigator.clipboard.writeText(profile.coupleId).then(() => notify("Couple ID copied."))}
                  >
                    Copy Couple ID
                  </button>
                </div>

                <div className="panel card chatPanel">
                  <div className="heading">
                    <div>
                      <p className="tag">Messages</p>
                      <h2>Private Chat</h2>
                    </div>
                  </div>

                  <div className={messages.length ? "messages" : "messages empty"}>
                    {messages.length ? messages.map((message) => (
                      <div className={`msg ${message.sender === profile.profileKey ? "me" : ""}`} key={message.id}>
                        {message.text}
                        <small>{message.senderName} • {formatTime(message.createdAt)}</small>
                      </div>
                    )) : "No messages yet."}
                  </div>

                  <form className="messageForm" onSubmit={sendMessage}>
                    <input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Type message..."
                    />
                    <button className="primary" type="submit">Send</button>
                  </form>
                </div>
              </div>
            </section>
          )}
        </main>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
