import io from 'https://cdn.socket.io/4.4.1/socket.io.esm.min.js';

const socket = io('http://localhost:3000'); // Assuming server is running on localhost:3000
let device, producer, consumer;

const joinRoomBtn = document.getElementById('join-room');
const roomIdInput = document.getElementById('room-id');
const usernameInput = document.getElementById('username');
const videoContainer = document.getElementById('videos');

// Control buttons
const startVideoBtn = document.getElementById('start-video');
const stopVideoBtn = document.getElementById('stop-video');
const startAudioBtn = document.getElementById('start-audio');
const stopAudioBtn = document.getElementById('stop-audio');

joinRoomBtn.addEventListener('click', async () => {
    const roomId = roomIdInput.value;
    const username = usernameInput.value;

    if (!roomId || !username) {
        alert('Please enter a Room ID and your Name.');
        return;
    }

    socket.emit('create-room', roomId, (response) => {
        if (response.success) {
            console.log(response.message);
            joinRoom(roomId, username);
        } else {
            console.error(response.message);
        }
    });
});

async function joinRoom(roomId, username) {
    socket.emit('join-room', roomId, username, async (response) => {
        if (response.success) {
            console.log(response.message);
            // Setup Mediasoup device
            device = new mediasoup.ClientDevice();
            await loadDeviceCapabilities(roomId);
            await createWebRtcTransport(roomId);
        } else {
            console.error(response.message);
        }
    });
}

async function loadDeviceCapabilities(roomId) {
    socket.emit('get-router-capabilities', roomId, async (rtpCapabilities) => {
        await device.load({ routerRtpCapabilities: rtpCapabilities });
    });
}

async function createWebRtcTransport(roomId) {
    socket.emit('create-transport', roomId, async (params) => {
        transport = device.createSendTransport(params);

        transport.on('connect', ({ dtlsParameters }, callback, errback) => {
            socket.emit('connect-transport', roomId, { dtlsParameters }, callback, errback);
        });

        // Request access to audio and video
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        videoTrack = stream.getVideoTracks()[0];
        audioTrack = stream.getAudioTracks()[0];

        // Produce the media tracks
        if (videoTrack) {
            await transport.produce({ track: videoTrack });
        }
        if (audioTrack) {
            await transport.produce({ track: audioTrack });
        }

        appendVideo(stream);
    });
}

function appendVideo(stream) {
    const videoElem = document.createElement('video');
    videoElem.srcObject = stream;
    videoElem.autoplay = true;
    videoContainer.appendChild(videoElem);
}

// Start/Stop Video
startVideoBtn.addEventListener('click', () => {
    if (videoTrack) {
        videoTrack.enabled = true; // Start video
        console.log('Video started');
    }
});

stopVideoBtn.addEventListener('click', () => {
    if (videoTrack) {
        videoTrack.enabled = false; // Stop video
        console.log('Video stopped');
    }
});

// Start/Stop Audio
startAudioBtn.addEventListener('click', () => {
    if (audioTrack) {
        audioTrack.enabled = true; // Start audio
        console.log('Audio started');
    }
});

stopAudioBtn.addEventListener('click', () => {
    if (audioTrack) {
        audioTrack.enabled = false; // Stop audio
        console.log('Audio stopped');
    }
});