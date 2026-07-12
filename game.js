// --- CANVAS & STATUS INITIALIZATION ---
const canvasBS = document.getElementById("canvas-battleship");
const ctxBS = canvasBS.getContext("2d");
const statusBS = document.getElementById("status-battleship");

const canvasC4 = document.getElementById("canvas-connect4");
const ctxC4 = canvasC4.getContext("2d");
const statusC4 = document.getElementById("status-connect4");

const canvasDots = document.getElementById("canvas-dots");
const ctxDots = canvasDots.getContext("2d");
const statusDots = document.getElementById("status-dots");

// --- MULTIPLAYER NETWORK STATE ---
let peer = null;
let conn = null;
let myPlayerNum = 1; 
let isOnline = false;
let myRoomCode = "";

// Generate a short 5-character ID code for cleaner sharing
function generateShortRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function initMultiplayer() {
    myRoomCode = generateShortRoomCode();
    
    // Leaving the ID blank inside Peer() lets the global cloud broker assign a perfectly unique connection hash,
    // while your custom TURN configurations handle the cross-country router routing.
    peer = new Peer({
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: 'turn:global.metered.ca:443', 
                    username: '240ecc7b24128dd720d1da42',
                    credential: '3AVhPN4mebvhCB+y'
                },
                {
                    urls: 'turn:global.metered.ca:80',
                    username: '240ecc7b24128dd720d1da42',
                    credential: '3AVhPN4mebvhCB+y'
                }
            ]
        }
    });
    
    peer.on('open', (id) => {
        // We link your unique ID to the display interface
        document.getElementById('my-peer-id').innerText = id;
        document.getElementById('share-btn').style.display = 'inline-block';
        document.getElementById('connection-status').innerText = "Status: Waiting for friend...";
        
        const urlParams = new URLSearchParams(window.location.search);
        const inviteRoom = urlParams.get('room');
        if (inviteRoom) {
            document.getElementById('remote-peer-id').value = inviteRoom;
            document.getElementById('connection-status').innerText = "Auto-joining room...";
            setTimeout(() => { connectToFriend(inviteRoom); }, 800); 
        }
    });

    peer.on('error', (err) => {
        console.error("PeerJS Error Type:", err.type, err);
        document.getElementById('connection-status').innerText = `Error: ${err.type}`;
    });

    peer.on('connection', (incomingConn) => {
        if (conn) return; 
        conn = incomingConn;
        myPlayerNum = 1; 
        setupConnectionHandlers();
    });
}

function copyInviteLink() {
    const currentId = document.getElementById('my-peer-id').innerText;
    if (!currentId || currentId === "---") return alert("Connection not initialized yet!");
    
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${currentId}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
        const shareBtn = document.getElementById('share-btn');
        shareBtn.innerText = "✅ Link Copied!";
        setTimeout(() => { shareBtn.innerText = "📋 Copy Invite Link"; }, 2000);
    });
}

function connectToFriend(targetId) {
    const remoteId = targetId || document.getElementById('remote-peer-id').value.trim();
    if (!remoteId) return alert("Please enter a connection code first!");
    
    document.getElementById('connection-status').innerText = "Connecting across networks...";
    conn = peer.connect(remoteId, {
        reliable: true
    });
    myPlayerNum = 2; 
    setupConnectionHandlers();
}

function setupConnectionHandlers() {
    function handleOpenConnection() {
        isOnline = true;
        document.getElementById('connection-status').innerText = `Connected! You are Player ${myPlayerNum}`;
        document.getElementById('connection-status').style.color = "#00bcd4";
        document.getElementById('join-section').style.display = 'none';
        resetAllGames();
    }

    if (conn.open) {
        handleOpenConnection();
    } else {
        conn.on('open', () => {
            handleOpenConnection();
        });
    }

    conn.on('data', (data) => {
        handleNetworkData(data);
    });

    conn.on('close', () => {
        isOnline = false;
        document.getElementById('connection-status').innerText = "Friend disconnected.";
        document.getElementById('connection-status').style.color = "#ea2e49";
        document.getElementById('join-section').style.display = 'flex';
    });
    
    conn.on('error', (err) => {
        console.error("Connection data channel error:", err);
    });
}

function sendNetworkAction(actionData) {
    if (isOnline && conn && conn.open) {
        conn.send(actionData);
    }
}

function handleNetworkData(data) {
    if (data.type === 'requestSizeChange') {
        let gameName = data.gameKey === 'battleship' ? 'Battleship' : (data.gameKey === 'connect4' ? 'Connect 4' : 'Dots & Boxes');
        let choice = confirm(`Friend wants to change size of ${gameName} to ${data.size}x${data.size}?`);
        
        if (choice) {
            applyGameSizeUpdate(data.gameKey, data.size);
            sendNetworkAction({ type: 'sizeChangeApproved', gameKey: data.gameKey, size: data.size });
        } else {
            sendNetworkAction({ type: 'sizeChangeDenied', gameKey: data.gameKey });
        }
    } else if (data.type === 'sizeChangeApproved') {
        applyGameSizeUpdate(data.gameKey, data.size);
    } else if (data.type === 'sizeChangeDenied') {
        let currentSize = getCurrentGameSize(data.gameKey);
        document.getElementById(`size-${data.gameKey}`).value = currentSize;
        alert("Friend declined to change the grid size.");
    } else if (data.type === 'bsSetup') {
        if (data.player === 1 && data.ships) {
            bsShips1 = data.ships;
            p1Ready = true;
        }
        if (data.player === 2 && data.ships) {
            bsShips2 = data.ships;
            p2Ready = true;
        }
        checkBattleshipPhases();
    } else if (data.type === 'bsFire') {
        processRemoteBattleshipFire(data.row, data.col);
    } else if (data.type === 'c4Click') {
        processConnect4Click(data.col, false);
    } else if (data.type === 'dotsClick') {
        processDotsClick(data.x, data.y, false);
    }
}

function resetAllGames() {
    resetBattleship();
    resetConnect4();
    resetDots();
}

function flashResultOverlay(elementId, winnerNum, resetCallback) {
    const overlayImg = document.getElementById(elementId);
    if (!overlayImg) return;
    
    if (winnerNum === myPlayerNum) {
        overlayImg.src = 'winner.png';
    } else {
        overlayImg.src = 'loser.png';
    }
    overlayImg.style.display = 'block';

    setTimeout(() => {
        overlayImg.style.display = 'none';
        if (typeof resetCallback === "function") {
            resetCallback();
        }
    }, 2000);
}


// ==========================================
// 1. BATTLESHIP ENGINE
// ==========================================
let bsSize = 6; 
let bsBoard1, bsBoard2, bsShips1, bsShips2;
let bsPhase = 'setup'; 
let p1Ready = false, p2Ready = false;
let bsTurn = 1;
let bsGameOver = false;

const SHIP_SIZES = [4, 3, 2, 2, 1, 1];
let currentShipIndex = 0;
let currentDir = 'H'; 
let mouseHover = { row: -1, col: -1 };
let localPlacingShips = [];

window.addEventListener('keydown', function(e) {
    if (e.key === 'r' || e.key === 'R') { currentDir = currentDir === 'H' ? 'V' : 'H'; drawBattleship(); }
});

canvasBS.addEventListener('contextmenu', function(e) {
    e.preventDefault(); currentDir = currentDir === 'H' ? 'V' : 'H'; drawBattleship();
});

function getBsLayout() {
    let cellSize = Math.floor(270 / bsSize);
    let offsetX = (canvasBS.width - (bsSize * cellSize)) / 2;
    let offsetY = 60;
    return { cellSize, offsetX, offsetY };
}

canvasBS.addEventListener('mousemove', function(e) {
    if (bsPhase !== 'setup') return;
    if (isOnline && ((myPlayerNum === 1 && p1Ready) || (myPlayerNum === 2 && p2Ready))) return;

    const rect = canvasBS.getBoundingClientRect();
    let x = e.clientX - rect.left; let y = e.clientY - rect.top;
    const { cellSize, offsetX, offsetY } = getBsLayout();
    let col = Math.floor((x - offsetX) / cellSize); let row = Math.floor((y - offsetY) / cellSize);
    let size = SHIP_SIZES[currentShipIndex];

    if (currentDir === 'H') {
        col = Math.max(0, Math.min(col, bsSize - size)); row = Math.max(0, Math.min(row, bsSize - 1));
    } else {
        col = Math.max(0, Math.min(col, bsSize - 1)); row = Math.max(0, Math.min(row, bsSize - size));
    }

    if (x < offsetX || x > offsetX + (bsSize * cellSize) || y < offsetY || y > offsetY + (bsSize * cellSize)) {
        mouseHover.row = -1; mouseHover.col = -1;
    } else {
        mouseHover.row = row; mouseHover.col = col;
    }
    drawBattleship();
});

canvasBS.addEventListener('click', function(e) {
    if (bsGameOver) return; 

    const rect = canvasBS.getBoundingClientRect();
    let x = e.clientX - rect.left; let y = e.clientY - rect.top;
    const { cellSize, offsetX, offsetY } = getBsLayout();
    let col = Math.floor((x - offsetX) / cellSize); let row = Math.floor((y - offsetY) / cellSize);
    if (col < 0 || col >= bsSize || row < 0 || row >= bsSize) return;

    if (bsPhase === 'setup') {
        if (isOnline && myPlayerNum === 1 && p1Ready) return;
        if (isOnline && myPlayerNum === 2 && p2Ready) return;

        let size = SHIP_SIZES[currentShipIndex];
        if (isValidPlacement(row, col, size, currentDir, localPlacingShips)) {
            localPlacingShips.push({ row, col, size, dir: currentDir, hitCount: 0, wrecked: false });
            currentShipIndex++;

            if (currentShipIndex < SHIP_SIZES.length) {
                statusBS.innerText = `Place size ${SHIP_SIZES[currentShipIndex]} ship`;
            } else {
                if (myPlayerNum === 1) { 
                    bsShips1 = [...localPlacingShips]; 
                    p1Ready = true; 
                } else { 
                    bsShips2 = [...localPlacingShips]; 
                    p2Ready = true; 
                }
                sendNetworkAction({ type: 'bsSetup', player: myPlayerNum, ships: localPlacingShips });
                checkBattleshipPhases();
            }
        }
    } else if (bsPhase === 'play') {
        if (isOnline && bsTurn !== myPlayerNum) return;

        let targetBoard = (bsTurn === 1) ? bsBoard2 : bsBoard1;
        if (targetBoard[row][col] > 0) return;

        sendNetworkAction({ type: 'bsFire', row, col });
        processRemoteBattleshipFire(row, col);
    }
    drawBattleship();
});

function checkBattleshipPhases() {
    let hasP1Fleet = bsShips1 && bsShips1.length === SHIP_SIZES.length;
    let hasP2Fleet = bsShips2 && bsShips2.length === SHIP_SIZES.length;

    if (!isOnline) {
        if (currentShipIndex >= SHIP_SIZES.length) {
            bsPhase = 'play'; bsTurn = 1;
            statusBS.innerText = "P1 Turn: Click Grid to Fire!";
        }
    } else {
        if (hasP1Fleet && hasP2Fleet) {
            p1Ready = true; p2Ready = true;
            bsPhase = 'play'; bsTurn = 1;
            statusBS.innerText = (myPlayerNum === 1) ? "Your Turn! Attack enemy grid." : "Enemy turn. They are aiming...";
        } else {
            let iAmReady = (myPlayerNum === 1 && p1Ready) || (myPlayerNum === 2 && p2Ready);
            if (iAmReady) {
                statusBS.innerText = "Waiting for friend setup...";
                let myShips = (myPlayerNum === 1) ? bsShips1 : bsShips2;
                if (myShips && myShips.length === SHIP_SIZES.length) {
                    sendNetworkAction({ type: 'bsSetup', player: myPlayerNum, ships: myShips });
                }
            } else {
                statusBS.innerText = `Place your fleet! (${currentShipIndex}/${SHIP_SIZES.length} ships placed)`;
            }
        }
    }
    drawBattleship();
}

function processRemoteBattleshipFire(row, col) {
    let targetBoard = (bsTurn === 1) ? bsBoard2 : bsBoard1;
    let enemyShips = (bsTurn === 1) ? bsShips2 : bsShips1;

    let hitShip = null;
    for (let ship of enemyShips) {
        for (let i = 0; i < ship.size; i++) {
            let r = ship.dir === 'V' ? ship.row + i : ship.row;
            let c = ship.dir === 'H' ? ship.col + i : ship.col;
            if (r === row && c === col) { hitShip = ship; break; }
        }
    }

    let isHit = false;
    if (hitShip) {
        targetBoard[row][col] = 3; 
        hitShip.hitCount++;
        if (hitShip.hitCount === hitShip.size) hitShip.wrecked = true;
        statusBS.innerText = `Player ${bsTurn} HIT!`;
        isHit = true;
    } else {
        targetBoard[row][col] = 2; 
        statusBS.innerText = `Player ${bsTurn} MISSED!`;
    }

    let allSunk = enemyShips.length === SHIP_SIZES.length && enemyShips.every(ship => ship.wrecked);

    if (allSunk) {
        statusBS.innerText = `Player ${bsTurn} Wins Entire Match!`;
        bsGameOver = true;
        bsPhase = 'gameover';
        flashResultOverlay('bs-overlay-img', bsTurn, resetBattleship);
    } else {
        if (!isHit) {
            bsTurn = (bsTurn === 1) ? 2 : 1;
        } else {
            statusBS.innerText += ` Player ${bsTurn} gets another shot!`;
        }
        
        if (isOnline && bsPhase === 'play') {
            statusBS.innerText += (bsTurn === myPlayerNum) ? " Your Turn!" : " Friend's Turn.";
        }
    }
    drawBattleship();
}

function isValidPlacement(row, col, size, dir, shipList) {
    if (dir === 'H' && col + size > bsSize) return false;
    if (dir === 'V' && row + size > bsSize) return false;
    for (let i = 0; i < size; i++) {
        let r = dir === 'V' ? row + i : row; let c = dir === 'H' ? col + i : col;
        for (let ship of shipList) {
            for (let j = 0; j < ship.size; j++) {
                let sr = ship.dir === 'V' ? ship.row + j : ship.row; let sc = ship.dir === 'H' ? ship.col + j : ship.col;
                if (r === sr && c === sc) return false;
            }
        }
    }
    return true;
}

function resetBattleship() {
    bsBoard1 = Array(bsSize).fill().map(() => Array(bsSize).fill(0));
    bsBoard2 = Array(bsSize).fill().map(() => Array(bsSize).fill(0));
    bsShips1 = []; bsShips2 = []; localPlacingShips = [];
    p1Ready = false; p2Ready = false;
    bsPhase = 'setup'; currentShipIndex = 0; bsTurn = 1; bsGameOver = false;
    statusBS.innerText = `Place size ${SHIP_SIZES[0]} ship (Press R to rotate)`;
    
    const overlayImg = document.getElementById('bs-overlay-img');
    if (overlayImg) overlayImg.style.display = 'none';
    
    drawBattleship();
}

function drawCruiseShip(ctx, x, y, size, dir, color, isWrecked) {
    ctx.fillStyle = color; ctx.strokeStyle = isWrecked ? "#7f1d1d" : "#1e293b"; ctx.lineWidth = 2;
    const { cellSize } = getBsLayout();
    let w = dir === 'H' ? size * cellSize : cellSize; let h = dir === 'V' ? size * cellSize : cellSize;
    ctx.beginPath();
    if (dir === 'H') {
        ctx.moveTo(x + 2, y + h/2); ctx.quadraticCurveTo(x + 8, y + 4, x + w - 12, y + 4); ctx.lineTo(x + w - 2, y + h/2); ctx.lineTo(x + w - 12, y + h - 4); ctx.quadraticCurveTo(x + 8, y + h - 4, x + 2, y + h/2);
    } else {
        ctx.moveTo(x + w/2, y + 2); ctx.quadraticCurveTo(x + 4, y + 8, x + 4, y + h - 12); ctx.lineTo(x + w/2, y + h - 2); ctx.lineTo(x + w - 4, y + h - 12); ctx.quadraticCurveTo(x + w - 4, y + 8, x + w/2, y + 2);
    }
    ctx.fill(); ctx.stroke();
}

function drawBattleship() {
    ctxBS.clearRect(0, 0, canvasBS.width, canvasBS.height);
    const { cellSize, offsetX, offsetY } = getBsLayout();

    for (let r = 0; r < bsSize; r++) {
        for (let c = 0; c < bsSize; c++) {
            ctxBS.strokeStyle = "#2c3e50"; ctxBS.lineWidth = 1;
            ctxBS.strokeRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
        }
    }

    if (bsPhase === 'setup') {
        localPlacingShips.forEach(ship => {
            drawCruiseShip(ctxBS, offsetX + ship.col*cellSize, offsetY + ship.row*cellSize, ship.size, ship.dir, "#7f8c8d", false);
        });
        if (mouseHover.row >= 0 && mouseHover.col >= 0 && currentShipIndex < SHIP_SIZES.length) {
            let size = SHIP_SIZES[currentShipIndex];
            let valid = isValidPlacement(mouseHover.row, mouseHover.col, size, currentDir, localPlacingShips);
            let color = valid ? "rgba(46, 204, 113, 0.5)" : "rgba(231, 76, 60, 0.5)";
            drawCruiseShip(ctxBS, offsetX + mouseHover.col*cellSize, offsetY + mouseHover.row*cellSize, size, currentDir, color, false);
        }
    } 
    else {
        let viewingTargetBoard = (myPlayerNum === 1) ? bsBoard2 : bsBoard1;
        let enemyShips = (myPlayerNum === 1) ? bsShips2 : bsShips1;

        if (enemyShips) {
            enemyShips.forEach(ship => {
                if (ship.wrecked || bsGameOver) {
                    drawCruiseShip(ctxBS, offsetX + ship.col*cellSize, offsetY + ship.row*cellSize, ship.size, ship.dir, "#991b1b", true);
                }
            });
        }

        for (let r = 0; r < bsSize; r++) {
            for (let c = 0; c < bsSize; c++) {
                let cx = offsetX + c * cellSize + cellSize/2;
                let cy = offsetY + r * cellSize + cellSize/2;
                let val = viewingTargetBoard[r][c];
                
                if (val === 2) { 
                    ctxBS.strokeStyle = "#2980b9"; ctxBS.lineWidth = 3;
                    ctxBS.beginPath(); ctxBS.arc(cx, cy, cellSize/5, 0, Math.PI*2); ctxBS.stroke();
                }
                if (val === 3) { 
                    ctxBS.fillStyle = "#e74c3c";
                    ctxBS.beginPath(); ctxBS.arc(cx, cy, cellSize/4, 0, Math.PI*2); ctxBS.fill();
                }
            }
        }
    }
}


// ==========================================
// 2. CONNECT 4 ENGINE
// ==========================================
let c4Rows = 6, c4Cols = 6;
let c4Grid;
let c4Turn = 1;
let c4GameOver = false;

function getC4Layout() {
    let padding = 4; let radius = Math.floor((280 / c4Cols - padding) / 2);
    let totalGridWidth = c4Cols * (radius * 2 + padding) - padding;
    let centerOffsetX = (canvasC4.width - totalGridWidth) / 2;
    let startY = 50;
    return { radius, padding, centerOffsetX, startY };
}

canvasC4.addEventListener('click', function(e) {
    if (c4GameOver) return;
    const rect = canvasC4.getBoundingClientRect(); let x = e.clientX - rect.left;
    const { radius, padding, centerOffsetX } = getC4Layout();
    let col = Math.floor((x - centerOffsetX) / (radius * 2 + padding));
    processConnect4Click(col, true);
});

function processConnect4Click(col, isLocalClick) {
    if (c4GameOver || col < 0 || col >= c4Cols) return;
    if (isOnline && isLocalClick && c4Turn !== myPlayerNum) return;

    for (let r = c4Rows - 1; r >= 0; r--) {
        if (c4Grid[r][col] === 0) {
            c4Grid[r][col] = c4Turn;
            if (isLocalClick) sendNetworkAction({ type: 'c4Click', col });

            if (checkC4Win(r, col)) {
                statusC4.innerText = `Player ${c4Turn} Wins!`; 
                c4GameOver = true;
                flashResultOverlay('c4-overlay-img', c4Turn, resetConnect4);
            } else {
                c4Turn = c4Turn === 1 ? 2 : 1;
                statusC4.innerText = isOnline ? (c4Turn === myPlayerNum ? "Your Turn!" : "Waiting for friend...") : `Player ${c4Turn === 1 ? '1 (Red)' : '2 (Yellow)'} Turn`;
            }
            break;
        }
    }
    drawConnect4();
}

function checkC4Win(r, c) {
    let p = c4Grid[r][c]; let directions = [[0,1], [1,0], [1,1], [1,-1]];
    for (let [dr, dc] of directions) {
        let count = 1;
        for (let i = 1; i < 4; i++) { if (c4Grid[r + dr*i]?.[c + dc*i] === p) count++; else break; }
        for (let i = 1; i < 4; i++) { if (c4Grid[r - dr*i]?.[c - dc*i] === p) count++; else break; }
        if (count >= 4) return true;
    }
    return false;
}

function resetConnect4() {
    c4Grid = Array(c4Rows).fill().map(() => Array(c4Cols).fill(0));
    c4Turn = 1; c4GameOver = false;
    statusC4.innerText = isOnline ? (myPlayerNum === 1 ? "Your Turn (Red)" : "Waiting for P1...") : "Player 1 (Red) Turn";
    
    const overlayImg = document.getElementById('c4-overlay-img');
    if (overlayImg) overlayImg.style.display = 'none';
    
    drawConnect4();
}

function drawConnect4() {
    ctxC4.clearRect(0, 0, canvasC4.width, canvasC4.height);
    const { radius, padding, centerOffsetX, startY } = getC4Layout();
    for (let r = 0; r < c4Rows; r++) {
        for (let c = 0; c < c4Cols; c++) {
            let x = centerOffsetX + c * (radius * 2 + padding) + radius;
            let y = r * (radius * 2 + padding) + radius + startY;
            ctxC4.fillStyle = "#2980b9"; ctxC4.fillRect(x-radius-2, y-radius-2, radius*2+4, radius*2+4);
            if (c4Grid[r][c] === 0) ctxC4.fillStyle = "#111";
            else if (c4Grid[r][c] === 1) ctxC4.fillStyle = "#e74c3c";
            else ctxC4.fillStyle = "#f1c40f";
            ctxC4.beginPath(); ctxC4.arc(x, y, radius, 0, Math.PI * 2); ctxC4.fill();
        }
    }
}


// ==========================================
// 3. DOTS AND BOXES ENGINE
// ==========================================
let dotsSize = 6; let hLines, vLines, boxes;
let dotsScore1 = 0, dotsScore2 = 0; let dotsTurn = 1; let dotsGameOver = false;

function getDotsLayout() {
    let spacing = Math.floor(260 / (dotsSize - 1));
    let startX = (canvasDots.width - (dotsSize - 1) * spacing) / 2;
    let startY = 60; let thresh = 10;
    return { spacing, startX, startY, thresh };
}

canvasDots.addEventListener('click', function(e) {
    if (dotsGameOver) return;
    const rect = canvasDots.getBoundingClientRect(); let x = e.clientX - rect.left; let y = e.clientY - rect.top;
    processDotsClick(x, y, true);
});

function processDotsClick(x, y, isLocalClick) {
    if (dotsGameOver) return;
    if (isOnline && isLocalClick && dotsTurn !== myPlayerNum) return;

    const { spacing, startX, startY, thresh } = getDotsLayout();
    let scored = false;

    for (let r = 0; r < dotsSize; r++) {
        for (let c = 0; c < dotsSize - 1; c++) {
            let lx = startX + c * spacing; let ly = startY + r * spacing;
            if (x >= lx && x <= lx + spacing && Math.abs(y - ly) < thresh && hLines[r][c] === 0) {
                hLines[r][c] = dotsTurn; 
                if (isLocalClick) sendNetworkAction({ type: 'dotsClick', x, y });
                scored = checkDotsBox();
                if (!scored) dotsTurn = dotsTurn === 1 ? 2 : 1;
                updateDots(); return;
            }
        }
    }
    for (let r = 0; r < dotsSize - 1; r++) {
        for (let c = 0; c < dotsSize; c++) {
            let lx = startX + c * spacing; let ly = startY + r * spacing;
            if (Math.abs(x - lx) < thresh && y >= ly && y <= ly + spacing && vLines[r][c] === 0) {
                vLines[r][c] = dotsTurn; 
                if (isLocalClick) sendNetworkAction({ type: 'dotsClick', x, y });
                scored = checkDotsBox();
                if (!scored) dotsTurn = dotsTurn === 1 ? 2 : 1;
                updateDots(); return;
            }
        }
    }
}

function checkDotsBox() {
    let gotBox = false;
    for(let r=0; r<dotsSize-1; r++) {
        for(let c=0; c<dotsSize-1; c++) {
            if (boxes[r][c] === 0 && hLines[r][c] !== 0 && hLines[r+1][c] !== 0 && vLines[r][c] !== 0 && vLines[r][c+1] !== 0) {
                boxes[r][c] = dotsTurn;
                if (dotsTurn === 1) dotsScore1++; else dotsScore2++;
                gotBox = true;
            }
        }
    }
    return gotBox;
}

function updateDots() {
    if (dotsScore1 + dotsScore2 === (dotsSize-1)*(dotsSize-1)) {
        dotsGameOver = true;
        let winnerPlayerNum = 1;
        
        if (dotsScore1 === dotsScore2) {
            statusDots.innerText = `Tie Game! (${dotsScore1}-${dotsScore2})`;
            winnerPlayerNum = myPlayerNum; 
        } else {
            winnerPlayerNum = dotsScore1 > dotsScore2 ? 1 : 2;
            statusDots.innerText = `P${winnerPlayerNum} Wins! (${Math.max(dotsScore1, dotsScore2)}-${Math.min(dotsScore1, dotsScore2)})`;
        }
        
        flashResultOverlay('dots-overlay-img', winnerPlayerNum, resetDots);
    } else {
        statusDots.innerText = `P1: ${dotsScore1} | P2: ${dotsScore2} -> Turn: P${dotsTurn}`;
    }
    drawDots();
}

function resetDots() {
    hLines = Array(dotsSize).fill().map(() => Array(dotsSize - 1).fill(0));
    vLines = Array(dotsSize - 1).fill().map(() => Array(dotsSize).fill(0));
    boxes = Array(dotsSize - 1).fill().map(() => Array(dotsSize - 1).fill(0));
    dotsScore1 = 0; dotsScore2 = 0; dotsTurn = 1; dotsGameOver = false;
    statusDots.innerText = "P1: Draw a line";
    
    const overlayImg = document.getElementById('dots-overlay-img');
    if (overlayImg) overlayImg.style.display = 'none';
    
    drawDots();
}

function drawDots() {
    ctxDots.clearRect(0, 0, canvasDots.width, canvasDots.height);
    const { spacing, startX, startY } = getDotsLayout();
    for(let r=0; r<dotsSize-1; r++) {
        for(let c=0; c<dotsSize-1; c++) {
            if (boxes[r][c] !== 0) {
                ctxDots.fillStyle = boxes[r][c] === 1 ? "rgba(52, 152, 219, 0.25)" : "rgba(231, 76, 60, 0.25)";
                ctxDots.fillRect(startX + c*spacing, startY + r*spacing, spacing, spacing);
            }
        }
    }
    ctxDots.lineWidth = 3;
    for (let r = 0; r < dotsSize; r++) {
        for (let c = 0; c < dotsSize - 1; c++) {
            let owner = hLines[r][c];
            ctxDots.strokeStyle = owner === 0 ? "#444444" : (owner === 1 ? "#3498db" : "#e74c3c");
            ctxDots.beginPath(); ctxDots.moveTo(startX + c * spacing, startY + r * spacing); ctxDots.lineTo(startX + (c + 1) * spacing, startY + r * spacing); ctxDots.stroke();
        }
    }
    for (let r = 0; r < dotsSize - 1; r++) {
        for (let c = 0; c < dotsSize; c++) {
            let owner = vLines[r][c];
            ctxDots.strokeStyle = owner === 0 ? "#444444" : (owner === 1 ? "#3498db" : "#e74c3c");
            ctxDots.beginPath(); ctxDots.moveTo(startX + c * spacing, startY + r * spacing); ctxDots.lineTo(startX + c * spacing, startY + (r + 1) * spacing); ctxDots.stroke();
        }
    }
    ctxDots.fillStyle = "#00bcd4";
    for (let r = 0; r < dotsSize; r++) {
        for (let c = 0; c < dotsSize; c++) {
            ctxDots.beginPath(); ctxDots.arc(startX + c * spacing, startY + r * spacing, 4, 0, Math.PI * 2); ctxDots.fill();
        }
    }
}


// ==========================================
// MUTUAL SIZE SELECTION DISPATCH ROUTER
// ==========================================
function changeGameSize(gameKey, size) {
    if (isOnline) {
        let gameName = gameKey === 'battleship' ? 'Battleship' : (gameKey === 'connect4' ? 'Connect 4' : 'Dots & Boxes');
        let selfConfirm = confirm(`Change size of ${gameName} to ${size}x${size}? This requires friend confirmation.`);
        
        if (selfConfirm) {
            sendNetworkAction({ type: 'requestSizeChange', gameKey, size });
        } else {
            let activeRunningSize = getCurrentGameSize(gameKey);
            document.getElementById(`size-${gameKey}`).value = activeRunningSize;
        }
    } else {
        applyGameSizeUpdate(gameKey, size);
    }
}

function getCurrentGameSize(gameKey) {
    if (gameKey === 'battleship') return bsSize;
    if (gameKey === 'connect4') return c4Rows; 
    if (gameKey === 'dots') return dotsSize;
    return 6;
}

function applyGameSizeUpdate(gameKey, size) {
    document.getElementById(`size-${gameKey}`).value = size;
    if (gameKey === 'battleship') { bsSize = size; resetBattleship(); } 
    else if (gameKey === 'connect4') { c4Rows = size; c4Cols = size; resetConnect4(); } 
    else if (gameKey === 'dots') { dotsSize = size; resetDots(); }
}

// Global Launcher Initialization
initMultiplayer();
resetAllGames();