import { initializeApp } from "firebase/app";
import { getFirestore, doc, collection, addDoc, getDocs, onSnapshot, updateDoc, deleteDoc } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
   apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
   authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
   projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
   storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
   messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
   appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const CONNECTIONS_COLLECTION = import.meta.env.VITE_FIREBASE_DB_COLLECTION || 'connections';

let currentPeer = null;
let localStream = null;
let connection = null;
let roomInfoGlobal = { Ref: null, Id: null };
let activeRoomId = null;
let activeRoomOwnerUid = null;
let activeRoomJoinedUid = null;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);
let currentUser = null;
let authReady = false;

async function ensureAnonymousAuth() {
   try {
      await signInAnonymously(auth);
      await new Promise((resolve, reject) => {
         const unsubscribe = onAuthStateChanged(auth, (user) => {
            try {
               currentUser = user;
               authReady = !!user;
               if (user) {
                  unsubscribe();
                  resolve(user);
               }
            } catch (e) {
               console.log(e.type);
               unsubscribe();
               reject(e);
            }
         }, (error) => {
            console.log(error.type);
            reject(error);
         });
      });
   } catch (e) {
      console.log(e.code || e.name || e.type || e.message);
      resetToDefault();
      showError(formatFirestoreError(e, 'Anonymous sign-in failed. Check that Anonymous Auth is enabled in Firebase and the API key is correct.'));
   }
}

function requireAuthFields(data) {
   return {
      ...data,
      ownerUid: currentUser ? currentUser.uid : null,
   };
}

function formatFirestoreError(error, fallbackMessage) {
   const detail = error && (error.message || error.code || error.name || error.type) || '';
   const blocked = String(detail).includes('ERR_BLOCKED_BY_CLIENT') || String(detail).includes('blocked by client');
   if (blocked) {
      return 'Firestore is being blocked by your browser or an extension. Disable the ad blocker/privacy shield for this site and retry.';
   }
   return fallbackMessage;
}

function trackActiveRoom(roomInfo, roomId, ownerUid, joinedUid) {
   roomInfoGlobal = {
      Ref: roomInfo.Ref,
      Id: roomInfo.Id,
   };
   activeRoomId = roomId || null;
   activeRoomOwnerUid = ownerUid || null;
   activeRoomJoinedUid = joinedUid || null;
}

async function deleteCollectionDocs(collectionName) {
   try {
      const snapshot = await getDocs(collection(db, collectionName));
      await Promise.all(snapshot.docs.map((entry) => deleteDoc(entry.ref)));
   } catch (e) {
      console.log(e.type);
   }
}

async function cleanupRemoteRoomData() {
   try {
      if (!currentUser || !roomInfoGlobal.Ref) {
         return;
      }

      const canCleanup = currentUser.uid === activeRoomOwnerUid || currentUser.uid === activeRoomJoinedUid;
      if (!canCleanup) {
         return;
      }

      const roomId = activeRoomId || roomInfoGlobal.Id;
      if (roomId) {
         await deleteCollectionDocs(roomId + 'caller');
         await deleteCollectionDocs(roomId + 'callee');
      }

      if (roomInfoGlobal.Ref) {
         await deleteDoc(roomInfoGlobal.Ref);
      }
   } catch (e) {
      console.log(e.type);
   }
}

// UI helpers: error modal and cleanup
function showError(message) {
   try {
      const modal = document.getElementById('errorModal');
      const text = document.getElementById('errorText');
      const ok = document.getElementById('errorOk');
      if (text) text.innerText = message || 'An unexpected error occurred.';
      if (modal) modal.style.display = 'flex';
      if (ok) {
         const handler = () => {
            modal.style.display = 'none';
            ok.removeEventListener('click', handler);
            // allow user to retry: reset UI
            disconnect();
         };
         ok.addEventListener('click', handler);
      }
   } catch (e) {
      console.log(e.type);
   }
}

function resetToDefault() {
   try {
      if (currentPeer) {
         try { currentPeer.close(); } catch(e){}
         currentPeer = null;
      }
      if (localStream) {
         try { localStream.getTracks().forEach(t => t.stop()); } catch(e){}
         localStream = null;
      }
      localVideo.srcObject = null;
      remoteVideo.srcObject = null;
      if (localContainer) localContainer.classList.remove('has-stream');
      if (remoteContainer) remoteContainer.classList.remove('has-stream');
   } catch (e) {
      console.log(e.type);
   }
}




async function connect() {
   try {
      var serverUrl;
      var scheme = "ws";
      // If this is an HTTPS connection, we have to use a secure WebSocket
      // connection too, so add another "s" to the scheme.

      if (document.location.protocol === "https:") {
         scheme += "s";
      }

      serverUrl = scheme + "://" + document.location.hostname + ":6502";

      connection = new WebSocket(serverUrl, "json");
      console.log("***CREATED WEBSOCKET");

      // here send the ICE and Connection Descriptor to init the connection
   } catch (e) {
      console.log(e.type);
      resetToDefault();
      showError('Failed to create websocket connection');
   }
}

function registerPeerConnectionListeners(peerConnection) {
   peerConnection.addEventListener('icegatheringstatechange', () => {
      console.log(
         `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
   });

   peerConnection.addEventListener('connectionstatechange', () => {
      console.log(`Connection state change: ${peerConnection.connectionState}`);
   });

   peerConnection.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state change: ${peerConnection.signalingState}`);
   });

   peerConnection.addEventListener('iceconnectionstatechange ', () => {
      console.log(
         `ICE connection state change: ${peerConnection.iceConnectionState}`);
   });
}

async function getCamera(peerConnection = null) {
   try {
      const constraints = { audio: true, video: true };
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      localVideo.srcObject = localStream;
      document.getElementById('localContainer').classList.add('has-stream');
      console.log('getting camera resources:', localStream);
      if (peerConnection && localStream) {
         localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
      }
   } catch (e) {
      console.log(e.type);
      resetToDefault();
      showError('Could not get camera: ' + (e.message || 'permission denied'));
   }
}
async function handlecommChannelStatusChange() {
   console.log("comm channel have changed :)");
}

async function createPeer() {
   try {
      const configuration = {
         iceServers: [
            {
               urls: [
                  'stun:stun1.l.google.com:19302',
                  'stun:stun2.l.google.com:19302',
               ],
            },
         ],
         iceCandidatePoolSize: 10,
      };
      var peerConnection = new RTCPeerConnection(configuration);
      peerConnection.ontrack = (event) => {
         try {
            console.log("remote track received");
            remoteVideo.srcObject = event.streams[0];
            document.getElementById('remoteContainer').classList.add('has-stream');
         } catch (e) {
            console.log(e.type);
         }
      };
      console.log("peer created: " + peerConnection);
      registerPeerConnectionListeners(peerConnection);
      peerConnection.createDataChannel("commChannel");
      peerConnection.onopen = handlecommChannelStatusChange;
      peerConnection.onclose = handlecommChannelStatusChange;
      if (localStream) {
         try { localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream)); } catch(e) { console.log(e.type); }
      }
      return peerConnection;
   } catch (e) {
      console.log(e.type);
      resetToDefault();
      showError('Failed to create peer connection');
   }
}

async function sendOffer(roomInfo, peerConnection) {
   try {
      var role = "caller";
      console.log("sending offer: " + peerConnection)
      const offer = await peerConnection.createOffer()

      await peerConnection.setLocalDescription(offer);
      const generateId = Math.random().toString(36).slice(2, 8); // this is not secure BTW :)
      console.log(generateId);
      sendCandidateToRemotePeer(generateId, peerConnection, role, currentUser ? currentUser.uid : null)
      // send to the server the offer somehow for god's sake and get remote description
      console.log("offer created")

      const roomWithOffer = {
         offer: { type: offer.type, sdp: offer.sdp },
         id: generateId,
         available: true,
         joinedUid: null,
         ownerUid: currentUser ? currentUser.uid : null
      }
      console.log("sending room info: ", roomWithOffer);
      // save to firestore
      roomInfo.Ref = await addDoc(collection(db, CONNECTIONS_COLLECTION), roomWithOffer);
      console.log("getting room: ", roomInfo);
      roomInfo.Id = roomInfo.Ref.id
      trackActiveRoom(roomInfo, generateId, currentUser ? currentUser.uid : null, null);
      await waitForAnswer(roomInfo, peerConnection);
      listenToRemoteCandidate(generateId, peerConnection, role)
   } catch (e) {
      console.log(e.code || e.name || e.type || e.message);
      resetToDefault();
      showError(formatFirestoreError(e, 'Failed while sending offer'));
   }
}

async function waitForAnswer(roomInfo, peerConnection) {
   try {
      console.log('waiting income connection from ref ')
      onSnapshot(roomInfo.Ref, (snapshot) => {
         try {
            const data = snapshot.data();
            if (!peerConnection.currentRemoteDescription && data.answer) {
               console.log('Set remote description: ', data.answer);
               const answer = new RTCSessionDescription(data.answer);
               peerConnection.setRemoteDescription(answer);
            }
         } catch (e) {
            console.log(e.type);
            resetToDefault();
            showError('Failed while applying remote answer');
         }
      });
   } catch (e) {
      console.log(e.type);
      resetToDefault();
      showError('Failed while waiting for answer');
   }

}


async function joinCall(roomInfo, peerConnection, role) {
   try {
      const querySnapshot = await getDocs(collection(db, CONNECTIONS_COLLECTION));
      var roomSnapshot = null;
      querySnapshot.forEach((doc) => {
         try {
            console.log("found an availble connection")
            if (doc.data().available == true) {
               roomInfo.Ref = doc.ref;
               roomInfo.Id = roomInfo.Ref.id;
               roomSnapshot = doc;
            }
         } catch (e) { console.log(e.type); }
      });

      if (roomInfo.Ref == null) {
         role = 'caller'
         await sendOffer(roomInfo, peerConnection);
         return
      }
      // this part can be wrapped in a function
      role = 'callee';
      const offer = roomSnapshot.data().offer;
      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      var generateId = roomSnapshot.data().id;
      console.log("callee found call with id: " + generateId)
      sendCandidateToRemotePeer(generateId, peerConnection, role, roomSnapshot.data().ownerUid);
      listenToRemoteCandidate(generateId, peerConnection, role);
      const roomWithAnswer = {
         answer: { type: answer.type, sdp: answer.sdp },
         available: false,
         joinedUid: currentUser ? currentUser.uid : null,
         ownerUid: roomSnapshot.data().ownerUid
      }
      console.log("room infoheld data: ")
      console.log(roomInfo.Ref)
      console.log(typeof roomInfo.Ref);
      await updateDoc(roomInfo.Ref, roomWithAnswer);
      trackActiveRoom(roomInfo, generateId, roomSnapshot.data().ownerUid, currentUser ? currentUser.uid : null);
   } catch (e) {
      console.log(e.code || e.name || e.type || e.message);
      resetToDefault();
      showError(formatFirestoreError(e, 'Failed while joining call'));
   }
}

async function sendCandidateToRemotePeer(roomId, peerConnection, role, roomOwnerUid) {
   try {
      console.log(role + " collecting ICE cands from room Id " + roomId)
      peerConnection.addEventListener('icecandidate', event => {
         if (event.candidate) {
            const json = event.candidate.toJSON();
            console.log(roomId + role);
              addDoc(collection(db, roomId + role), {
               ...requireAuthFields(json),
               usernameFragment: json.usernameFragment || null,
               roomOwnerUid: roomOwnerUid || null,
            }).catch(err => {
               console.log(err.code || err.name || err.type || err.message);
               resetToDefault();
               showError(formatFirestoreError(err, 'Failed while sending ICE candidate'));
            });
         }
      });
   } catch (e) {
      console.log(e.code || e.name || e.type || e.message);
      resetToDefault();
      showError(formatFirestoreError(e, 'Failed while setting up ICE candidate listener'));
   }
}

async function listenToRemoteCandidate(roomId, peerConnection, role) {
   // Listen to the other remote ICE cands
   // under collection name " roomId + remoterole"
   const remoteRole = (role == "caller") ? "callee" : "caller";
   console.log("my role is: " + role + " remote role is: " + remoteRole)

   try {
      onSnapshot(collection(db, roomId + remoteRole), (snapshot) => {
         try {
            snapshot.docChanges().forEach((change) => {
               if (change.type === "added") {
                  const candidate = new RTCIceCandidate(change.doc.data());
                  console.log("candidate recieved: ");
                  console.log(candidate);
                  peerConnection.addIceCandidate(candidate).catch(err => {
                     console.log(err.code || err.name || err.type || err.message);
                     resetToDefault();
                     showError(formatFirestoreError(err, 'Failed while adding remote ICE candidate'));
                  });
               }
            })
         } catch (e) {
            console.log(e.code || e.name || e.type || e.message);
            resetToDefault();
            showError(formatFirestoreError(e, 'Error processing remote ICE candidates'));
         }
      }, (error) => {
         console.log(error.code || error.name || error.type || error.message);
         resetToDefault();
         showError(formatFirestoreError(error, 'Failed to listen to remote ICE candidates'));
      });
   } catch (e) {
      console.log(e.code || e.name || e.type || e.message);
      resetToDefault();
      showError(formatFirestoreError(e, 'Failed to listen to remote ICE candidates'));
   }


}
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const localContainer = document.getElementById('localContainer');
const remoteContainer = document.getElementById('remoteContainer');

async function run() {
   var peerConnection = null; // RTCPeerConnection for our connection

   var commChannel = null; // RTCDataChannel for the local (sender)
   var receiveChannel = null; // RTCDataChannel for the remote (receiver)

   var connection = null;
   var roomInfo = {
      Ref: null,
      Id: null
   };


   try {
      console.log("Starting chat...");
      if (!authReady) {
         await ensureAnonymousAuth();
      }
      peerConnection = await createPeer();
      currentPeer = peerConnection;
      await getCamera(peerConnection);

      var role = null;
      await joinCall(roomInfo, peerConnection, role);
   } catch (e) {
      console.log(e.type);
      resetToDefault();
      showError('An error occurred while starting the chat');
   }





}




const button = document.getElementById("startBtn");

button.addEventListener("click", run);

async function disconnect() {
   cleanupRemoteRoomData().catch((e) => {
      console.log(e.type);
   });
   if (currentPeer) {
      try { currentPeer.close(); } catch(e){}
      currentPeer = null;
   }
   if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
   }
   localVideo.srcObject = null;
   remoteVideo.srcObject = null;
   localContainer.classList.remove('has-stream');
   remoteContainer.classList.remove('has-stream');
   roomInfoGlobal = { Ref: null, Id: null };
   activeRoomId = null;
   activeRoomOwnerUid = null;
   activeRoomJoinedUid = null;
}

const disconnectBtn = document.getElementById('disconnectBtn');
if (disconnectBtn) disconnectBtn.addEventListener('click', disconnect);

const sendMsgBtn = document.getElementById('sendMsgBtn');
const chatInput = document.getElementById('chatInput');
if (sendMsgBtn) {
   sendMsgBtn.addEventListener('click', () => {
      showError('Messaging feature is not available yet.');
   });
}
if (chatInput) {
   chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
         event.preventDefault();
         showError('Messaging feature is not available yet.');
      }
   });
}

window.addEventListener('DOMContentLoaded', () => {
   // Show camera immediately when app loads
   ensureAnonymousAuth().then(() => getCamera()).catch(() => {});
});