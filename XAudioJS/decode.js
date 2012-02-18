/* (c) 2011 Grant Galitz
	So far this file can decode most WAV and AIFF data.
	It can also skip through ID3 tags to find the actual song data.
	Will add support for non-WAV formats later.
*/
function Decoder(rawInput) {
	if (rawInput) {
		this.raw = rawInput;
		this.binaryLength = this.raw.length;
		if (this.binaryLength > 3) {
			//Initialize some variables:
			this.song = null;
			this.channels = 0;
			this.sampleRate = 0;
			this.bitsPerSample = 0;
			this.littleEndian(true);	//Default to little endian mode.
			this.headerOffset = 0;
			//Process the data and then set up the output access:
			this.searchForHeader();		//Search and decode (If candidate match) the binary data.
			this.setupSlice();			//Map our slice abstraction for external use.
			this.raw = null;			//Release the binary data, since we don't need it anymore.
		}
		else {
			throw(new Error("Data length too small."));
		}
	}
	else {
		throw(new Error("Invalid decoder initialization."));
	}
}
Decoder.prototype.searchForHeader = function () {
	//First search for WAV:
	if (!this.searchForWAVEContainer()) {
		if (!this.searchForAIFFContainer()) {
			this.searchForOtherFormats();
		}
		else {
			//Possible AIFF file found:
			this.checkAIFFFormat();
		}
	}
	else {
		//Possible WAVE container found (RIFF-esqe prefix found):
		this.checkWAVEFormat();
	}
}
Decoder.prototype.searchForWAVEContainer = function () {
	//Reset the header offset and initialize the check loop:
	this.headerOffset = 0;
	var length = this.binaryLength - 40;
	var subString = "";
	while (this.headerOffset < length) {
		subString = this.raw.substr(this.headerOffset, 4);
		if (subString == "RIFF") {		//Little endian
			//RIFF container format:
			return true;
		}
		else if (subString == "RIFX" || subString == "FFIR") {
			//RIFX-FFIR container format:
			this.littleEndian(false);	//Set to big endian mode.
			return true;
		}
		else if (subString == "FORM") {
			//Exit for AIFF being detected.
			return false;
		}
		++this.headerOffset;	//Alignment may not be on natural 4-byte boundaries.
	}
	return false;
}
Decoder.prototype.searchForAIFFContainer = function () {
	//Reset the header offset and initialize the check loop:
	this.headerOffset = 0;
	var length = this.binaryLength - 12;
	var subString = "";
	while (this.headerOffset < length) {
		subString = this.raw.substr(this.headerOffset, 4);
		if (subString == "FORM") {
			//AIFF standard ID header chunk found.
			return true;
		}
		++this.headerOffset;	//Alignment may not be on natural 4-byte boundaries.
	}
	return false;
}
Decoder.prototype.checkWAVEFormat = function () {
	if (this.raw.substr(8 + this.headerOffset, 4) == "WAVE") {
		//WAVE file:
		var wavDecoder = new WAVDecoder(this);	//Decode the WAV data.
	}
	else {
		throw(new Error("Music file in RIFF format is of unknown type."));
	}
}
Decoder.prototype.checkAIFFFormat = function () {
	var ckID = this.raw.substr(8 + this.headerOffset, 4);
	if (ckID == "AIFF") {
		//Classic AIFF file:
		this.littleEndian(false);	//Set to big endian mode.
		var aiffDecoder = new AIFFDecoder(this, false);	//Decode the AIFF data.
	}
	else if (ckID == "AIFC") {
		//Recent AIFF-C file:
		this.littleEndian(false);	//Set to big endian mode.
		var aiffDecoder = new AIFFDecoder(this, true);	//Decode the AIFF-C data.
	}
	else {
		throw(new Error("Music file in AIFF format is of unknown type."));
	}
}
Decoder.prototype.ensureLength = function (minimumLength) {
	if (this.binaryLength <= minimumLength) {
		//Throw a nice error instead of weird fails:
		throw(new Error("Music file illegally too small to continue decoding."));
	}
}
Decoder.prototype.searchForOtherFormats = function () {
	throw(new Error("Codec unknown."));
}
Decoder.prototype.decodeFL32 = function (binaryIndex, length) {
	//Initialize some variables:
	var data = 0;
	var exponent = 0;
	length -= (length - binaryIndex) & 3;									//Make sure we don't iterate out of bounds.
	this.initializeStorage((length - binaryIndex) >> 2);
	for (var songBuildIndex = 0; binaryIndex < length; binaryIndex += 4) {	//Loop for every four bytes.
		/*Custom number to 32-bit IEEE float converter:
			- The exponent is what we dispatch on,
			since the IEEE float standard has special cases for it.
			- We round case 0 to 0 because audio output is usually 16-bit on the actual computer.
			- We max/min case 0xFF results to 1/-1 for proper ranging.
			- If case is above 0 and below 0xFF, then handle normally.
			
			Some IEEE float 32 breakdown for people curious:
				- MSB is the sign bit of the float.
				- The exponent is 8-bit and comes in just below the sign bit.
				- The 23-bit (**24th-bit is implied**) mantissa, aka the actual data, fills in the rest.
				- Basically we add the implied 24th bit to the mantissa, then we divide it by 2 to the 23rd power (Or multiply by 2 to the -23rd!),
					then we multiply that result by 2 to the power of the exponent number given MINUS 127,
					then lastly we sign the result according to the sign bit.
		*/
		data = this.dwordAt(binaryIndex);		//Grab a js number holding a *signed* 32-bit number.
		exponent = (data & 0x7F800000) >> 23;	//Extract the exponent for handling dispatch and later use.
		switch (exponent) {
			case 0:
				//Value very close to zero, so make it zero (We're cheating because doing it right here still makes the final result physically zero in the end):
				//Please don't "fix" this cheat, because systems drop the part of the float that wouldn't be zero here:
				this.song[songBuildIndex++] = 0;
				break;
			case 0xFF:
				//Convert +/- infinity to 1 or -1:
				this.song[songBuildIndex++] = (data < 0) ? -1 : 1;
				break;
			default:
				//Process normally (Yes, the entire conversion is on this one line!):
				this.song[songBuildIndex++] = Math.max(Math.min(((data < 0) ? -1 : 1) * Math.pow(2, exponent - 150) * (0x800000 | (data & 0x7FFFFF)), 1), -1);
		}
	}
}
Decoder.prototype.decodeFL64 = function (binaryIndex, length) {
	//Initialize some variables:
	var highDWord = 0;
	var exponent = 0;
	length -= (length - binaryIndex) & 7;									//Make sure we don't iterate out of bounds.
	this.initializeStorage((length - binaryIndex) >> 3);
	for (var songBuildIndex = 0; binaryIndex < length; binaryIndex += 8) {	//Loop for every eight bytes.
		this.qwordAt(binaryIndex);
		highDWord = this.qwordHighDWord;
		exponent = (highDWord >> 20) & 0x7FF;
		switch (exponent) {
			case 0:
				//Value very close to zero, so make it zero (We're cheating because doing it right here still makes the final result physically zero in the end):
				//Please don't "fix" this cheat, because systems drop the part of the float that wouldn't be zero here:
				this.song[songBuildIndex++] = 0;
				break;
			case 0x7FF:
				//Convert +/- infinity to 1 or -1:
				this.song[songBuildIndex++] = (highDWord < 0) ? -1 : 1;
				break;
			default:
				this.song[songBuildIndex++] = Math.max(Math.min(((highDWord < 0) ? -1 : 1) * Math.pow(2, exponent - 1023) * (1 + ((highDWord & 0xFFFFF) / 0x100000) + (this.qwordLowDWord / 4503599627370496)), 1), -1);
		}
	}
}
Decoder.prototype.decodeSIGNED = function (binaryIndex, length) {
	//Two's complement packed:
	var songBuildIndex = 0;
	var bitAliasing = (8 - (this.bitsPerSample & 7)) & 7;
	var bitsUsed = (this.bitsPerSample > 24) ? 0xFFFFFFFF : ((1 << (this.bitsPerSample + bitAliasing)) - 1);
	bitsUsed -= (1 << bitAliasing) - 1;
	var divider = bitsUsed / 2;
	var realLength = length - binaryIndex;
	switch ((this.bitsPerSample + bitAliasing) >> 3) {	//Split the cases as an optimization.
		case 1:
			this.initializeStorage(length - binaryIndex);
			if (this.bitsPerSample == 8) {
				for (; binaryIndex < length; ++binaryIndex) {
					this.song[songBuildIndex++] = (((this.byteAt(binaryIndex) << 24) >> 24) + 0.5) / 127.5;
				}
			}
			else {
				for (; binaryIndex < length; ++binaryIndex) {
					this.song[songBuildIndex++] = ((((this.byteAt(binaryIndex) & bitsUsed) << 24) >> 24) + 0.5) / divider;
				}
			}
			break;
		case 2:
			length -= realLength & 1;
			this.initializeStorage((length - binaryIndex) >> 1);
			if (this.bitsPerSample == 16) {
				for (; binaryIndex < length; binaryIndex += 2) {
					this.song[songBuildIndex++] = (((this.wordAt(binaryIndex) << 16) >> 16) + 0.5) / 32767.5;
				}
			}
			else {
				for (; binaryIndex < length; binaryIndex += 2) {
					this.song[songBuildIndex++] = ((((this.wordAt(binaryIndex) & bitsUsed) << 16) >> 16) + 0.5) / divider;
				}
			}
			break;
		case 3:
			length -= realLength % 3;
			this.initializeStorage((length - binaryIndex) / 3);
			if (this.bitsPerSample == 24) {
				for (; binaryIndex < length; binaryIndex += 3) {
					this.song[songBuildIndex++] = (((this.ohwordAt(binaryIndex) << 8) >> 8) + 0.5) / 8388607.5;
				}
			}
			else {
				for (; binaryIndex < length; binaryIndex += 3) {
					this.song[songBuildIndex++] = ((((this.ohwordAt(binaryIndex) & bitsUsed) << 8) >> 8) + 0.5) / divider;
				}
			}
			break;
		case 4:
			length -= realLength & 3;
			this.initializeStorage((length - binaryIndex) >> 2);
			if (this.bitsPerSample == 32) {
				for (; binaryIndex < length; binaryIndex += 4) {
					this.song[songBuildIndex++] = (this.dwordAt(binaryIndex) + 0.5) / 2147483647.5;
				}
			}
			else {
				for (; binaryIndex < length; binaryIndex += 4) {
					this.song[songBuildIndex++] = ((this.dwordAt(binaryIndex) & bitsUsed) + 0.5) / divider;
				}
			}
			break;
		case 5:
			length -= realLength % 5;
			this.initializeStorage((length - binaryIndex) / 5);
			if (this.bitsPerSample == 40) {
				for (; binaryIndex < length; binaryIndex += 5) {
					this.qwordAt(binaryIndex);
					this.song[songBuildIndex++] = ((((this.qwordHighDWord << 24) >> 24) * 4294967296) + this.qwordLowDWord + 0.5) / 549755813887.5;
				}
			}
			else {
				divider += 547608330240;
				for (; binaryIndex < length; binaryIndex += 5) {
					this.qwordAt(binaryIndex);
					this.song[songBuildIndex++] = ((((this.qwordHighDWord << 24) >> 24) * 4294967296) + ((this.qwordLowDWord & bitsUsed) >>> 0) + 0.5) / divider;
				}
			}
			break;
		case 6:
			length -= realLength % 6;
			this.initializeStorage((length - binaryIndex) / 6);
			if (this.bitsPerSample == 48) {
				for (; binaryIndex < length; binaryIndex += 6) {
					this.qwordAt(binaryIndex);
					this.song[songBuildIndex++] = ((((this.qwordHighDWord << 16) >> 16) * 4294967296) + this.qwordLowDWord + 0.5) / 140737488355327.5;
				}
			}
			else {
				divider += 140735340871680;
				for (; binaryIndex < length; binaryIndex += 6) {
					this.qwordAt(binaryIndex);
					this.song[songBuildIndex++] = ((((this.qwordHighDWord << 16) >> 16) * 4294967296) + ((this.qwordLowDWord & bitsUsed) >>> 0) + 0.5) / divider;
				}
			}
			break;
		case 7:
			length -= realLength % 7;
			this.initializeStorage((length - binaryIndex) / 7);
			if (this.bitsPerSample == 56) {
				for (; binaryIndex < length; binaryIndex += 7) {
					this.qwordAt(binaryIndex);
					this.song[songBuildIndex++] = ((((this.qwordHighDWord << 8) >> 8) * 4294967296) + this.qwordLowDWord + 0.5) / 36028797018963967.5;
				}
			}
			else {
				divider += 36028794871480320;
				for (; binaryIndex < length; binaryIndex += 7) {
					this.qwordAt(binaryIndex);
					this.song[songBuildIndex++] = ((((this.qwordHighDWord << 8) >> 8) * 4294967296) + ((this.qwordLowDWord & bitsUsed) >>> 0) + 0.5) / divider;
				}
			}
			break;
		case 8:
			length -= realLength & 7;
			this.initializeStorage((length - binaryIndex) >> 3);
			if (this.bitsPerSample == 64) {
				for (; binaryIndex < length; binaryIndex += 8) {
					this.qwordAt(binaryIndex);
					this.song[songBuildIndex++] = ((this.qwordHighDWord * 4294967296) + this.qwordLowDWord + 0.5) / 9223372036854775807.5;
				}
			}
			else {
				divider += 9223372034707292160;
				for (; binaryIndex < length; binaryIndex += 8) {
					this.qwordAt(binaryIndex);
					this.song[songBuildIndex++] = ((this.qwordHighDWord * 4294967296) + ((this.qwordLowDWord & bitsUsed) >>> 0) + 0.5) / divider;
				}
			}
			break;
		default:
			throw(new Error("Signed PCM " + this.bitsPerSample + " bits per sample is unsupported."));
	}
}
Decoder.prototype.decodeUNSIGNED = function (binaryIndex, length) {
	//Unsigned:
	if (this.bitsPerSample == 8) {
		this.initializeStorage(length - binaryIndex);
		for (var songBuildIndex = 0; binaryIndex < length; ++binaryIndex) {
			this.song[songBuildIndex++] = (this.byteAt(binaryIndex) / 127.5) - 1;
		}
	}
	else if (this.bitsPerSample < 8) {
		var bitAliasing = (8 - (this.bitsPerSample & 7)) & 7;
		var bitsUsed = (((1 << (this.bitsPerSample + bitAliasing)) - 1) >> bitAliasing) << bitAliasing;
		var divider = bitsUsed / 2;
		this.initializeStorage(length - binaryIndex);
		for (var songBuildIndex = 0; binaryIndex < length; ++binaryIndex) {
			this.song[songBuildIndex++] = ((this.byteAt(binaryIndex) & bitsUsed) / divider) - 1;
		}
	}
	else {
		throw(new Error("Unsigned PCM " + this.bitsPerSample + " bits per sample is unsupported."));
	}
}
Decoder.prototype.decodeALAW = function (binaryIndex, length) {
	this.initializeStorage(length - binaryIndex);
	for (var songBuildIndex = 0; binaryIndex < length; ++binaryIndex) {
		this.song[songBuildIndex++] = this.aLawTable[this.byteAt(binaryIndex)] / 0x7FFF;
	}
}
Decoder.prototype.decodeULAW = function (binaryIndex, length) {
	this.initializeStorage(length - binaryIndex);
	for (var songBuildIndex = 0; binaryIndex < length; ++binaryIndex) {
		this.song[songBuildIndex++] = this.muLawTable[this.byteAt(binaryIndex)] / 0x7FFF;
	}
}
Decoder.prototype.byteAt = function (at) {
	return this.raw.charCodeAt(at) & 0xFF;
}
Decoder.prototype.littleWordAt = function (at) {
	return (this.byteAt(at + 1) << 8) | (this.byteAt(at));
}
Decoder.prototype.bigWordAt = function (at) {
	return (this.byteAt(at) << 8) | (this.byteAt(at + 1));
}
Decoder.prototype.littleOneAndHalfWordAt = function (at) {
	return (this.byteAt(at + 2) << 16) | (this.byteAt(at + 1) << 8) | (this.byteAt(at));
}
Decoder.prototype.bigOneAndHalfWordAt = function (at) {
	return (this.byteAt(at) << 16) | (this.byteAt(at + 1) << 8) | (this.byteAt(at + 2));
}
Decoder.prototype.littleDWordAt = function (at) {
	return (this.byteAt(at + 3) << 24) | (this.byteAt(at + 2) << 16) | (this.byteAt(at + 1) << 8) | (this.byteAt(at));
}
Decoder.prototype.bigDWordAt = function (at) {
	return (this.byteAt(at) << 24) | (this.byteAt(at + 1) << 16) | (this.byteAt(at + 2) << 8) | (this.byteAt(at + 3));
}
Decoder.prototype.littleQWordAt = function (at) {
	//Save the high and low dwords in separate props:
	this.qwordHighDWord = this.littleDWordAt(at + 4, 4);
	this.qwordLowDWord = this.littleDWordAt(at, 4) >>> 0;
}
Decoder.prototype.bigQWordAt = function (at) {
	//Save the high and low dwords in separate props:
	this.qwordHighDWord = this.bigDWordAt(at, 4);
	this.qwordLowDWord = this.bigDWordAt(at + 4, 4) >>> 0;
}
Decoder.prototype.littleEndian = function (isLittle) {
	this.wordAt = (isLittle) ? this.littleWordAt : this.bigWordAt;
	this.ohwordAt = (isLittle) ? this.littleOneAndHalfWordAt : this.bigOneAndHalfWordAt;
	this.dwordAt = (isLittle) ? this.littleDWordAt : this.bigDWordAt;
	this.qwordAt = (isLittle) ? this.littleQWordAt : this.bigQWordAt;
}
Decoder.prototype.initializeStorage = function (length) {
	try {
		this.song = new Float32Array(length);
	}
	catch (e) {
		this.song = [];
	}
}
Decoder.prototype.sliceTyped = function (begin, end) {
	return this.song.subarray(begin, end);
}
Decoder.prototype.sliceNormal = function (begin, end) {
	return this.song.slice(begin, end);
}
Decoder.prototype.setupSlice = function () {
	this.slice = (typeof this.song.subarray == "function") ? this.sliceTyped : this.sliceNormal;
	this.songLength = this.song.length;
}
Decoder.prototype.aLawTable = [
     -5504, -5248, -6016, -5760, -4480, -4224, -4992, -4736,
     -7552, -7296, -8064, -7808, -6528, -6272, -7040, -6784,
     -2752, -2624, -3008, -2880, -2240, -2112, -2496, -2368,
     -3776, -3648, -4032, -3904, -3264, -3136, -3520, -3392,
     -22016,-20992,-24064,-23040,-17920,-16896,-19968,-18944,
     -30208,-29184,-32256,-31232,-26112,-25088,-28160,-27136,
     -11008,-10496,-12032,-11520,-8960, -8448, -9984, -9472,
     -15104,-14592,-16128,-15616,-13056,-12544,-14080,-13568,
     -344,  -328,  -376,  -360,  -280,  -264,  -312,  -296,
     -472,  -456,  -504,  -488,  -408,  -392,  -440,  -424,
     -88,   -72,   -120,  -104,  -24,   -8,    -56,   -40,
     -216,  -200,  -248,  -232,  -152,  -136,  -184,  -168,
     -1376, -1312, -1504, -1440, -1120, -1056, -1248, -1184,
     -1888, -1824, -2016, -1952, -1632, -1568, -1760, -1696,
     -688,  -656,  -752,  -720,  -560,  -528,  -624,  -592,
     -944,  -912,  -1008, -976,  -816,  -784,  -880,  -848,
      5504,  5248,  6016,  5760,  4480,  4224,  4992,  4736,
      7552,  7296,  8064,  7808,  6528,  6272,  7040,  6784,
      2752,  2624,  3008,  2880,  2240,  2112,  2496,  2368,
      3776,  3648,  4032,  3904,  3264,  3136,  3520,  3392,
      22016, 20992, 24064, 23040, 17920, 16896, 19968, 18944,
      30208, 29184, 32256, 31232, 26112, 25088, 28160, 27136,
      11008, 10496, 12032, 11520, 8960,  8448,  9984,  9472,
      15104, 14592, 16128, 15616, 13056, 12544, 14080, 13568,
      344,   328,   376,   360,   280,   264,   312,   296,
      472,   456,   504,   488,   408,   392,   440,   424,
      88,    72,   120,   104,    24,     8,    56,    40,
      216,   200,   248,   232,   152,   136,   184,   168,
      1376,  1312,  1504,  1440,  1120,  1056,  1248,  1184,
      1888,  1824,  2016,  1952,  1632,  1568,  1760,  1696,
      688,   656,   752,   720,   560,   528,   624,   592,
      944,   912,  1008,   976,   816,   784,   880,   848
];
Decoder.prototype.muLawTable = [
     -32124,-31100,-30076,-29052,-28028,-27004,-25980,-24956,
     -23932,-22908,-21884,-20860,-19836,-18812,-17788,-16764,
     -15996,-15484,-14972,-14460,-13948,-13436,-12924,-12412,
     -11900,-11388,-10876,-10364, -9852, -9340, -8828, -8316,
      -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
      -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
      -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
      -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
      -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
      -1372, -1308, -1244, -1180, -1116, -1052,  -988,  -924,
       -876,  -844,  -812,  -780,  -748,  -716,  -684,  -652,
       -620,  -588,  -556,  -524,  -492,  -460,  -428,  -396,
       -372,  -356,  -340,  -324,  -308,  -292,  -276,  -260,
       -244,  -228,  -212,  -196,  -180,  -164,  -148,  -132,
       -120,  -112,  -104,   -96,   -88,   -80,   -72,   -64,
        -56,   -48,   -40,   -32,   -24,   -16,    -8,     -1,
      32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
      23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
      15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
      11900, 11388, 10876, 10364,  9852,  9340,  8828,  8316,
       7932,  7676,  7420,  7164,  6908,  6652,  6396,  6140,
       5884,  5628,  5372,  5116,  4860,  4604,  4348,  4092,
       3900,  3772,  3644,  3516,  3388,  3260,  3132,  3004,
       2876,  2748,  2620,  2492,  2364,  2236,  2108,  1980,
       1884,  1820,  1756,  1692,  1628,  1564,  1500,  1436,
       1372,  1308,  1244,  1180,  1116,  1052,   988,   924,
        876,   844,   812,   780,   748,   716,   684,   652,
        620,   588,   556,   524,   492,   460,   428,   396,
        372,   356,   340,   324,   308,   292,   276,   260,
        244,   228,   212,   196,   180,   164,   148,   132,
        120,   112,   104,    96,    88,    80,    72,    64,
         56,    48,    40,    32,    24,    16,     8,     0 
];