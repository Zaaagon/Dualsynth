var context = new AudioContext();
var size = 1024;
var numTables = 2;
var waveTables = [];

var sliderList = [];
var labelList = [];
var volumeList = [];
var volumeLabelList = [];
var oscEnabledList = [];
var toggleButtonList = [];
var fmDepthList = [];
var fmDepthPrev = [];

var isPlaying = false;
var scriptNode = null;

function setup() {
	createCanvas(600, 350);
	pixelDensity(2);
	smooth();

	for (var t = 0; t < numTables; t++) {
		waveTables.push(Array(size).fill(0).map(function(_, i) { return Math.sin(2 * Math.PI * i / (size - 1)); }));
		fmDepthPrev.push(0);
	}

	var gap = 20, cols = 2;
	var boxWidth = (width - gap * (cols + 1)) / cols;
	var boxHeight = boxWidth / 2;

	for (var t = 0; t < numTables; t++) {
		var col = t % cols;
		var row = Math.floor(t / cols);
		var x = gap + col * (boxWidth + gap);
		var y = gap + row * (boxHeight + 180) + 40;

		createP("OSC " + (t + 1)).position(x + 10, y - 28).style('color', 'white').style('margin', '0px');

		(function(currentT, x, boxWidth, y) {
			var toggleButton = createButton("ON");
			toggleButton.position(x + boxWidth - 50, y - 30);
			oscEnabledList[currentT] = true;
			toggleButton.html("ON");
			toggleButton.mousePressed(function () {
				oscEnabledList[currentT] = !oscEnabledList[currentT];
				toggleButton.html(oscEnabledList[currentT] ? "ON" : "OFF");
			});
			toggleButtonList.push(toggleButton);
		})(t, x, boxWidth, y);

		var slider = createSlider(16, 108, 69, 1);
		slider.position(x, y + boxHeight + 10);
		sliderList.push(slider);

		var label = createP("");
		label.position(x + 160, y + boxHeight + 10);
		label.style('color', 'white').style('margin', '0px');
		labelList.push(label);

		var volumeSlider = createSlider(0, 1, 0.5, 0.01);
		volumeSlider.position(x, y + boxHeight + 35);
		volumeList.push(volumeSlider);

		var volumeLabel = createP("0 dB");
		volumeLabel.position(x + 160, y + boxHeight + 35);
		volumeLabel.style('color', 'white').style('margin', '0px');
		volumeLabelList.push(volumeLabel);

		(function(currentT) {
			var normButton = createButton("Normalize");
			normButton.position(x, y + boxHeight + 60);
			normButton.mousePressed(function () {
				normalizeWave(currentT);
			});
		})(t);

		(function(currentT) {
			var smoothButton = createButton("Smooth");
			smoothButton.position(x + 87, y + boxHeight + 60);
			smoothButton.mousePressed(function () {
				lowPassFilter(currentT);
			});
		})(t);

		(function(currentT) {
			var initButton = createButton("Initial");
			initButton.position(x + 160, y + boxHeight + 60);
			initButton.mousePressed(function () {
				resetWave(currentT);
			});
		})(t);

		(function(currentT) {
			var fmDepthLabel = createP("0.0%");
			fmDepthLabel.style('color', 'white').style('margin', '0px');

			var fmDepthSlider = createSlider(0, 100, 0, 0.1);
			fmDepthSlider.position(x, y + boxHeight + 80);
			fmDepthLabel.position(x + fmDepthSlider.width + 80, y + boxHeight + 80);
			fmDepthSlider.style('width', (boxWidth * 0.6) + 'px');
			fmDepthSlider.input(function () {
				fmDepthLabel.html(fmDepthSlider.value().toFixed(1) + "%");
			});
			fmDepthList.push(fmDepthSlider);
		})(t);
	}

	var toggleRealtimeBtn = createButton("Start");
	toggleRealtimeBtn.position(10, height - 30);
	toggleRealtimeBtn.mousePressed(function () {
		isPlaying = !isPlaying;
		if (isPlaying) {
			startRealtimePlayback();
			toggleRealtimeBtn.html("Stop");
		} else {
			stopRealtimePlayback();
			toggleRealtimeBtn.html("Start");
		}
	});
}

function draw() {
	background(0);
	var gap = 20, cols = 2;
	var boxWidth = (width - gap * (cols + 1)) / cols;
	var boxHeight = boxWidth / 2;

	for (var t = 0; t < numTables; t++) {
		var col = t % cols;
		var row = Math.floor(t / cols);
		var x = gap + col * (boxWidth + gap);
		var y = gap + row * (boxHeight + 180) + 40;

		stroke(255);
		noFill();
		rect(x, y - 40, boxWidth, boxHeight + 140);

		stroke(100);
		rect(x, y, boxWidth, boxHeight);

		stroke(0, 204, 0);
		noFill();
		beginShape();
		for (var px = 0; px < boxWidth; px++) {
			var index = Math.floor(map(px, 0, boxWidth - 1, 0, size - 1));
			var value = waveTables[t][index];
			var py = y + boxHeight / 2 - value * (boxHeight / 2);
			vertex(x + px, py);
		}
		endShape();
	}

	for (var i = 0; i < numTables; i++) {
		var midi = sliderList[i].value();
		var freq = midiToFreqNum(midi).toFixed(1);
		labelList[i].html(midiToNoteName(midi) + " (" + freq + " Hz)");

		var linear = volumeList[i].value();
		volumeLabelList[i].html(linear === 0 ? "-∞" : Math.round(20 * Math.log10(linear)) + " dB");
	}
}

function startRealtimePlayback() {
	if (!scriptNode) {
		var sampleRate = context.sampleRate;
		scriptNode = context.createScriptProcessor(1024, 0, 1);
		var phases = new Array(numTables).fill(0);

		scriptNode.onaudioprocess = function (e) {
			var output = e.outputBuffer.getChannelData(0);
			output.fill(0);

			for (var i = 0; i < numTables; i++) {
				if (!oscEnabledList[i]) continue;

				var table = waveTables[i];
				var freq = midiToFreqNum(sliderList[i].value());
				var volume = volumeList[i].value();
				var modTable = waveTables[(i + 1) % numTables];

				var rawDepth = fmDepthList[i].value() / 100 * freq;
				fmDepthPrev[i] = fmDepthPrev[i] * 0.9 + rawDepth * 0.1;
				var modDepth = fmDepthPrev[i];

				for (var j = 0; j < output.length; j++) {
					var modVal = interpolate(modTable, phases[i] % 1);
					var carrierPhase = (phases[i] + modDepth * modVal) % 1;
					var sample = interpolate(table, carrierPhase) * volume;
					output[j] += sample;
					phases[i] += freq / sampleRate;
					if (phases[i] >= 1) phases[i] -= 1;
				}
			}

			for (var j = 0; j < output.length; j++) {
				output[j] = Math.max(-1, Math.min(1, output[j]));
			}
		};

		scriptNode.connect(context.destination);
	}
}

function stopRealtimePlayback() {
	if (scriptNode) {
		scriptNode.disconnect();
		scriptNode = null;
	}
}

function mouseDragged() {
	handleWaveEdit(mouseX, mouseY);
}

function mousePressed() {
	if (context.state !== 'running') context.resume();
	handleWaveEdit(mouseX, mouseY);
}

function handleWaveEdit(mx, my) {
	var gap = 20, cols = 2;
	var boxWidth = (width - gap * (cols + 1)) / cols;
	var boxHeight = boxWidth / 2;
	var brushSize = 5;

	for (var t = 0; t < numTables; t++) {
		var col = t % cols;
		var row = Math.floor(t / cols);
		var x = gap + col * (boxWidth + gap);
		var y = gap + row * (boxHeight + 180) + 40;

		if (mx >= x && mx < x + boxWidth && my >= y && my < y + boxHeight) {
			var center = Math.floor((mx - x) / boxWidth * size);
			var val = constrain(map(my - y, boxHeight, 0, -1, 1), -1, 1);
			for (var i = -brushSize; i <= brushSize; i++) {
				var idx = center + i;
				if (idx >= 0 && idx < size) waveTables[t][idx] = val;
			}
		}
	}
}

function interpolate(table, phase) {
	var index = phase * (size - 1);
	var i0 = Math.floor(index);
	var i1 = Math.min(i0 + 1, size - 1);
	var frac = index - i0;
	return table[i0] * (1 - frac) + table[i1] * frac;
}

function normalizeWave(index) {
	var table = waveTables[index];
	var maxVal = Math.max.apply(null, table.map(Math.abs));
	if (maxVal > 0) {
		for (var i = 0; i < size; i++) table[i] /= maxVal;
	}
}

function lowPassFilter(index, kernelSize) {
	if (kernelSize === undefined) kernelSize = 10;
	var table = waveTables[index];
	var half = Math.floor(kernelSize / 2);
	var smoothed = new Array(size).fill(0);
	for (var i = 0; i < size; i++) {
		var sum = 0, count = 0;
		for (var j = -half; j <= half; j++) {
			var idx = i + j;
			if (idx >= 0 && idx < size) {
				sum += table[idx];
				count++;
			}
		}
		smoothed[i] = sum / count;
	}
	waveTables[index] = smoothed;
}

function resetWave(index) {
	for (var i = 0; i < size; i++) {
		waveTables[index][i] = Math.sin(2 * Math.PI * i / (size - 1));
	}
}

function midiToFreqNum(note) {
	return 440 * Math.pow(2, (note - 69) / 12);
}

function midiToNoteName(note) {
	var names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
	return names[note % 12] + (Math.floor(note / 12) - 1);
}