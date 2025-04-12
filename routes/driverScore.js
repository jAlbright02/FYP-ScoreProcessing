const express = require('express');
const router = express.Router();

router.post('/processFile', (req, res) => {
    const { processContent } = req.body;
    if (!processContent) {
        return res.json({ success: false, message: "No content provided" });
    }

    //make line endings the same, remove spaces and split into lines for processing
    const lines = processContent.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 5) {
        return res.json({ success: false, message: "Insufficient data" });
    }

    // Process records
    /* Line of data looks like this 
       time:2025-04-10T16:24:14.689+01:00,speed:128,rpm:3984,engine_load:42,eng_cool_temp:104,mass_af:153,fuel_lvl:10,ambtemp:4,man_press:144,bar_press:26,speed_limit:30
       so we need to convert to objects in order to process
    */
    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const record = {};
        const pairs = lines[i].split(',');
        
        for (const pair of pairs) {
            const [key, value] = pair.split(':');
            if (key && value !== undefined) {
                record[key.trim()] = value.trim();
            }
        }
        
        if (Object.keys(record).length > 0) {
            records.push(record);
        }
    }

    //set vals before looping
    let score = 100;
    let highRpmCount = 0;
    let highLoadCount = 0;
    let smoothDrivingCount = 0;
    let previousScore = score;

    //scoring system
    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        
        //convert strings to nums
        const speed = parseInt(record.speed || 0);
        const rpm = parseInt(record.rpm || 0);
        const engineLoad = parseInt(record.engine_load || 0);
        const speedLimit = parseInt(record.speed_limit || 0);


        previousScore = score;

        //speed rules
        if (speedLimit > 0 && speed > speedLimit) {
            const excessSpeed = speed - speedLimit;
            
            //10% allowance for speeding
            if (excessSpeed > speedLimit * 0.1) {
                //progressive penalty scale
                const buffer = speedLimit * 0.05; //scale down
                const adjustedExcess = excessSpeed - buffer;
                const rawPenalty = Math.pow(adjustedExcess, 1.3) * 0.02; //make the excess ^1.3 then scale down
                const penalty = Math.min(10, Math.floor(rawPenalty)); //round down to nearest whole number with a cap of 10

                score -= penalty;
            }
        }

        //rpm rules
        const rpmThreshold = (speed > 80) ? 3500 : 2500; //going onto a national? threshold increases 

        if (rpm > 7000) {
            score -= 3; //immediate penalty for redlining
            highRpmCount = 0;
        } else if (rpm > rpmThreshold) {
            highRpmCount++;
            //penalty for sustained high RPM
            if (highRpmCount >= 10) {
                score -= 1 + Math.floor((rpm - rpmThreshold) / 500); //for every 500 rpm over, additional penalty
                highRpmCount = 0;
            }
        } else {
            highRpmCount = Math.max(0, highRpmCount - 2); //account for gear changes
        }

        //engine load rules
        const loadThreshold = (speed > 60) ? 95 : 90;

        if (engineLoad >= 100) {
            score -= 0.5; //aggressive driving
            highLoadCount = 0;
        } else if (engineLoad > loadThreshold) {
            highLoadCount++;
            if (highLoadCount >= 8) {
                score -= 0.3 * (highLoadCount - 7);
                highLoadCount = 4; // Partial reset
            }
        } else {
            highLoadCount = Math.max(0, highLoadCount - 2); //account for gear changes
        }

        //reward for good driving
        if (speed <= speedLimit && 
            rpm < 2500 && 
            engineLoad < 80) {
            smoothDrivingCount++;
            if (smoothDrivingCount >= 15) {
                score = Math.min(100, score + 1);
                smoothDrivingCount = 0;
            }
        } else {
            smoothDrivingCount = 0;
        }

        //ensure score stays between 0 and 100
        score = Math.max(0, Math.min(100, score));
    }

    //normalise score by trip length
    const tripMinutes = records.length / 60; //a lines recorded every second, get the length based on this
    const normalisedScore = (tripMinutes >= 5) 
        ? Math.min(100, score * (1 + tripMinutes/120)) 
        : score; //if trip too short, just return base score

    return res.json({ 
        success: true,
        score: Math.max(0, Math.round(normalisedScore * 10) / 10)
    });
});

module.exports = router;