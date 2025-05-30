var sketch = function(p) {
    var context = new AudioContext();
    var size = 1024;
    var numTables = 2;
    var waveTables = [];

    var sliderList = [];
    var labelList = [];
    var volumeList = [];
    var volumeLabelList = [];
    var fmDepthList = [];
    var fmDepthPrev = [];

    var isPlaying = false;
    var scriptNode = null;

    p.setup = function() {
        let canvas = p.createCanvas(600, 350);
        canvas.parent('synth-container');
        p.pixelDensity(2);
        p.smooth();

        for (var t = 0; t < numTables; t++) {
            waveTables.push(Array(size).fill(0).map(function(_, i) {
                return Math.sin(2 * Math.PI * i / (size - 1));
            }));
            fmDepthPrev.push(0);
        }

        var gap = 20, cols = 2;
        var boxWidth = (p.width - gap * (cols + 1)) / cols;
        var boxHeight = boxWidth / 2;

        for (let t = 0; t < numTables; t++) {
            var col = t % cols;
            var row = Math.floor(t / cols);
            var x = gap + col * (boxWidth + gap);
            var y = gap + row * (boxHeight + 180) + 40;

            let oscLabel = p.createP("OSC " + (t + 1));
            oscLabel.parent('synth-container');
            oscLabel.position(x + 10, y - 28).style('color', 'white').style('margin', '0px');

            var slider = p.createSlider(16, 108, 69, 1);
            slider.parent('synth-container');
            slider.position(x, y + boxHeight + 10);
            sliderList.push(slider);

            var label = p.createP("");
            label.parent('synth-container');
            label.position(x + 160, y + boxHeight + 10);
            label.style('color', 'white').style('margin', '0px');
            labelList.push(label);

            var volumeSlider = p.createSlider(0, 1, 0.5, 0.01);
            volumeSlider.parent('synth-container');
            volumeSlider.position(x, y + boxHeight + 35);
            volumeList.push(volumeSlider);

            var volumeLabel = p.createP("0 dB");
            volumeLabel.parent('synth-container');
            volumeLabel.position(x + 160, y + boxHeight + 35);
            volumeLabel.style('color', 'white').style('margin', '0px');
            volumeLabelList.push(volumeLabel);

            (function(currentT) {
                var normButton = p.createButton("Normalize");
                normButton.parent('synth-container');
                normButton.position(x, y + boxHeight + 60);
                normButton.mousePressed(function () {
                    normalizeWave(currentT);
                });
            })(t);

            (function(currentT) {
                var smoothButton = p.createButton("Smooth");
                smoothButton.parent('synth-container');
                smoothButton.position(x + 87, y + boxHeight + 60);
                smoothButton.mousePressed(function () {
                    lowPassFilter(currentT);
                });
            })(t);

            (function(currentT) {
                var initButton = p.createButton("Initial");
                initButton.parent('synth-container');
                initButton.position(x + 160, y + boxHeight + 60);
                initButton.mousePressed(function () {
                    resetWave(currentT);
                });
            })(t);

            (function(currentT) {
                var fmDepthLabel = p.createP("0.0%");
                fmDepthLabel.parent('synth-container');
                fmDepthLabel.style('color', 'white').style('margin', '0px');

                var fmDepthSlider = p.createSlider(0, 100, 0, 0.1);
                fmDepthSlider.parent('synth-container');
                fmDepthSlider.position(x, y + boxHeight + 80);
                fmDepthLabel.position(x + fmDepthSlider.width + 80, y + boxHeight + 80);
                fmDepthSlider.style('width', (boxWidth * 0.6) + 'px');
                fmDepthSlider.input(function () {
                    fmDepthLabel.html(fmDepthSlider.value().toFixed(1) + "%");
                });
                fmDepthList.push(fmDepthSlider);
            })(t);
        }

        var toggleRealtimeBtn = p.createButton("Start");
        toggleRealtimeBtn.parent('synth-container');
        toggleRealtimeBtn.position(10, p.height - 30);
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

		var exportBtn = p.createButton("Export Audio");
		exportBtn.parent('synth-container');
		exportBtn.position(p.width - 120, p.height - 30);
		exportBtn.mousePressed(exportAudio);
    };

    p.draw = function() {
        p.background(0);
        var gap = 20, cols = 2;
        var boxWidth = (p.width - gap * (cols + 1)) / cols;
        var boxHeight = boxWidth / 2;

        for (var t = 0; t < numTables; t++) {
            var col = t % cols;
            var row = Math.floor(t / cols);
            var x = gap + col * (boxWidth + gap);
            var y = gap + row * (boxHeight + 180) + 40;

            p.stroke(255);
            p.noFill();
            p.rect(x, y - 40, boxWidth, boxHeight + 140);

            p.stroke(100);
            p.rect(x, y, boxWidth, boxHeight);

            p.stroke(0, 204, 0);
            p.noFill();
            p.beginShape();
            for (var px = 0; px < boxWidth; px++) {
                var index = Math.floor(p.map(px, 0, boxWidth - 1, 0, size - 1));
                var value = waveTables[t][index];
                var py = y + boxHeight / 2 - value * (boxHeight / 2);
                p.vertex(x + px, py);
            }
            p.endShape();
        }

        for (var i = 0; i < numTables; i++) {
            var midi = sliderList[i].value();
            var freq = midiToFreqNum(midi).toFixed(1);
            labelList[i].html(midiToNoteName(midi) + " (" + freq + " Hz)");

            var linear = volumeList[i].value();
            volumeLabelList[i].html(linear === 0 ? "-∞" : Math.round(20 * Math.log10(linear)) + " dB");
        }
    };

    p.mousePressed = function() {
        if (context.state !== 'running') context.resume();
        handleWaveEdit(p.mouseX, p.mouseY);
    };

    p.mouseDragged = function() {
        handleWaveEdit(p.mouseX, p.mouseY);
    };

    function handleWaveEdit(mx, my) {
        var gap = 20, cols = 2;
        var boxWidth = (p.width - gap * (cols + 1)) / cols;
        var boxHeight = boxWidth / 2;
        var brushSize = 5;

        for (var t = 0; t < numTables; t++) {
            var col = t % cols;
            var row = Math.floor(t / cols);
            var x = gap + col * (boxWidth + gap);
            var y = gap + row * (boxHeight + 180) + 40;

            if (mx >= x && mx < x + boxWidth && my >= y && my < y + boxHeight) {
                var center = Math.floor((mx - x) / boxWidth * size);
                var val = p.constrain(p.map(my - y, boxHeight, 0, -1, 1), -1, 1);
                for (var i = -brushSize; i <= brushSize; i++) {
                    var idx = center + i;
                    if (idx >= 0 && idx < size) waveTables[t][idx] = val;
                }
            }
        }
    }

	////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////

    function startRealtimePlayback() {
        if (!scriptNode) {
            var sampleRate = context.sampleRate;
            scriptNode = context.createScriptProcessor(1024, 0, 1);
            var phase1 = 0, phase2 = 0;

            scriptNode.onaudioprocess = function(e) {
                var output = e.outputBuffer.getChannelData(0);
                output.fill(0);

                var table1 = waveTables[0];
                var table2 = waveTables[1];
                var freq1 = midiToFreqNum(sliderList[0].value());
                var freq2 = midiToFreqNum(sliderList[1].value());
                var vol1 = volumeList[0].value();
                var vol2 = volumeList[1].value();
                var fmDepth1 = fmDepthList[0].value() / 100;
                var fmDepth2 = fmDepthList[1].value() / 100;

                for (var i = 0; i < output.length; i++) {
                    var modVal2 = interpolate(table2, phase2 % 1);
                    var modVal1 = interpolate(table1, phase1 % 1);

                    var offset1 = Math.tanh(modVal2 * fmDepth1) * 0.5;
                    var offset2 = Math.tanh(modVal1 * fmDepth2) * 0.5;

                    var sample1 = interpolate(table1, (phase1 + offset1 + 1) % 1) * vol1;
                    var sample2 = interpolate(table2, (phase2 + offset2 + 1) % 1) * vol2;

                    output[i] += sample1 + sample2;

                    phase1 += freq1 / sampleRate;
                    phase2 += freq2 / sampleRate;

                    if (phase1 >= 1) phase1 -= 1;
                    if (phase2 >= 1) phase2 -= 1;
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

	////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////

    function midiToFreqNum(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    function midiToNoteName(note) {
        var names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
        return names[note % 12] + (Math.floor(note / 12) - 1);
    }

	////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////

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

    function interpolate(table, phase) {
        var index = phase * (size - 1);
        var i0 = Math.floor(index);
        var i1 = Math.min(i0 + 1, size - 1);
        var frac = index - i0;
        return table[i0] * (1 - frac) + table[i1] * frac;
    }

	////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////

	function exportAudio() {
		let duration = 3; 
		let sampleRate = 44100;
		let offlineCtx = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
		let buffer = offlineCtx.createBuffer(1, sampleRate * duration, sampleRate);
		let output = buffer.getChannelData(0);
	  
		let phase1 = 0, phase2 = 0;
	  
		for (let i = 0; i < output.length; i++) {
		  	let t = i / sampleRate;
	  
		  	let table1 = waveTables[0];
		  	let table2 = waveTables[1];
		 	let freq1 = midiToFreqNum(sliderList[0].value());
		  	let freq2 = midiToFreqNum(sliderList[1].value());
		  	let vol1 = volumeList[0].value();
		  	let vol2 = volumeList[1].value();
		  	let fmDepth1 = fmDepthList[0].value() / 100;
		  	let fmDepth2 = fmDepthList[1].value() / 100;
	  
		  	let modVal2 = interpolate(table2, phase2 % 1);
		  	let modVal1 = interpolate(table1, phase1 % 1);
	  
		  	let offset1 = Math.tanh(modVal2 * fmDepth1) * 0.5;
		  	let offset2 = Math.tanh(modVal1 * fmDepth2) * 0.5;
	  
		  	let sample1 = interpolate(table1, (phase1 + offset1 + 1) % 1) * vol1;
		  	let sample2 = interpolate(table2, (phase2 + offset2 + 1) % 1) * vol2;
	  
		  	let sample = sample1 + sample2;
		  	output[i] = Math.max(-1, Math.min(1, sample));
	  
		  	phase1 += freq1 / sampleRate;
		  	phase2 += freq2 / sampleRate;
		  	if (phase1 >= 1) phase1 -= 1;
		  	if (phase2 >= 1) phase2 -= 1;
		}
	  
		let source = offlineCtx.createBufferSource();
		source.buffer = buffer;
		source.connect(offlineCtx.destination);
		source.start();
	  
		offlineCtx.startRendering().then(function(renderedBuffer) {
		  	let wavBlob = bufferToWav(renderedBuffer);
		  	let url = URL.createObjectURL(wavBlob);
		  	let a = document.createElement('a');
		  	a.style.display = 'none';
		  	a.href = url;
		  	a.download = 'yoursynth.wav';
		  	document.body.appendChild(a);
		  	a.click();
		  	window.URL.revokeObjectURL(url);
		  	a.remove();
		});
	}

	function bufferToWav(buffer) {
		let numOfChan = buffer.numberOfChannels,
			length = buffer.length * numOfChan * 2 + 44,
			bufferArray = new ArrayBuffer(length),
			view = new DataView(bufferArray),
			channels = [],
			i, sample,
			offset = 0,
			pos = 0;
	  
		setUint32(0x46464952);
		setUint32(length - 8); 
		setUint32(0x45564157); 
	  
		setUint32(0x20746d66); 
		setUint32(16);        
		setUint16(1);          
		setUint16(numOfChan);
		setUint32(buffer.sampleRate);
		setUint32(buffer.sampleRate * 2 * numOfChan); 
		setUint16(numOfChan * 2);                  
		setUint16(16);                                
	  
		setUint32(0x61746164); 
		setUint32(length - pos - 4);
	  
	
		for(i = 0; i < buffer.numberOfChannels; i++)
		  	channels.push(buffer.getChannelData(i));
	  
			while(pos < length) {
		  		for(i = 0; i < numOfChan; i++) {
					sample = Math.max(-1, Math.min(1, channels[i][offset])); 
					sample = (sample * 32767) | 0;  
					view.setInt16(pos, sample, true);
					pos += 2;
		  		}
		  	offset++;
		}
	  
		return new Blob([bufferArray], {type: "audio/wav"});
	  
		function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
		function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
	}
};