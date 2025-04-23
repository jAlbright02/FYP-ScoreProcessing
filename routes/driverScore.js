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

    //monitor the amount of infractions/good driving
    let speedFaults = 0;
    let rpmFaults = 0;
    let loadFaults = 0;
    let cleanDriving = 0;

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
            speedFaults++;
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
        const rpmThreshold = (speed > 80) ? 3000 : 2500; //going onto a national? threshold increases 

        if (rpm > 5000) {
            rpmFaults++;
            score -= 3; //immediate penalty for redlining
            highRpmCount = 0;
        } else if (rpm > rpmThreshold) {
            rpmFaults++;
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

        if (engineLoad == 100) {
            loadFaults++;
            score -= 0.5; //aggressive driving
            highLoadCount = 0;
        } else if (engineLoad > loadThreshold) {
            loadFaults++;
            highLoadCount++;
            if (highLoadCount >= 8) {
                score -= 0.3 * (highLoadCount - 7);
                highLoadCount = 4; //partial reset
            }
        } else {
            highLoadCount = Math.max(0, highLoadCount - 2); //account for gear changes
        }

        //reward for good driving
        if (speed <= speedLimit && 
            rpm < 2500 && 
            engineLoad < 80) {
            smoothDrivingCount++;
            cleanDriving++;
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

    let advice = feedback(speedFaults, rpmFaults, loadFaults, cleanDriving);

    return res.json({ 
        success: true,
        score: Math.max(0, Math.round(normalisedScore * 10) / 10),
        message: advice
    });
});

function feedback(nSpeed, nRPM, nLoad, nClean) {
    let speedRes = [];
    let rpmRes = [];
    let loadRes = [];
    let cleanRes = [];
    switch (Math.round(nSpeed/10)*10) {
        case 0:
            speedRes.push('You have not broken any speed limits!');
            break;
        case 10:
            speedRes.push(nSpeed, ' speeding infractions. Minor concern, please watch your speed.');
            break;
        case 20:
            speedRes.push(nSpeed, ' speeding infractions. Pattern is emerging, be aware of your speed and the speed limits set in place for your safety.'); 
            break;
        case 30:
            speedRes.push(nSpeed, ' speeding infractions. Please maintain a safe speed while driving.'); 
            break;       
        case 40:
            speedRes.push(nSpeed, ' speeding infractions. You are frequently speeding, please be more mindful.'); 
            break;
        default:
            speedRes.push(nSpeed, ' speeding infractions. Focus on the stated speed limit for the roads you are on.');
            break;            
    }

    switch (Math.round(nRPM/10)*10) {
        case 0:
            rpmRes.push('You are treating the engine well, keep it up!');
            break;
        case 10:
            rpmRes.push(nRPM, ' high RPM instances. Try shifting earlier to reduce wear / tear on the engine.');
            break;
        case 20:
            rpmRes.push(nRPM, ' high RPM instances. Be aware of your revs during acceleration.'); 
            break;
        case 30:
            rpmRes.push(nRPM, ' high RPM instances. Your driving style will lead to unnecessary engine wear over time.'); 
            break;       
        case 40:
            rpmRes.push(nRPM, ' high RPM instances. Your revs are consistently too high, adjust your driving to protect the engine.'); 
            break;
        default:
            rpmRes.push(nRPM, ' high RPM instances. Driving like this will damage your engine and shorten its life span.');
            break;            
    }
    switch (Math.round(nLoad/10)*10) {
        case 0:
            loadRes.push('No aggressive driving detected.');
            break;
        case 10:
            loadRes.push(nLoad, ' engine load infractions. Avoid pushing the engine unless needed.'); 
            break;
        case 20:
            loadRes.push(nLoad, ' engine load infractions. Be mindful of how you are treating the engine.'); 
            break;
        case 30:
            loadRes.push(nLoad, ' engine load infractions. Avoid steep inclines if possible or keep speed while doing so.'); 
            break;       
        case 40:
            loadRes.push(nLoad, ' engine load infractions. You might be overloading the engine, which can cause long term damage.'); 
            break;
        default:
            loadRes.push(nLoad, ' engine load infractions. Consider driving less aggressively or reconsider your route if it is hilly.'); 
            break;            
    }
    switch (Math.round(nClean/10)*10) {
        case 0:
            cleanRes.push('Drive smoothly and watch your speed.');
            break;
        case 10:
            cleanRes.push(nClean, ' instances of logged smooth driving. Keep it up!'); 
            break;
        case 20:
            cleanRes.push(nClean, ' instances of logged smooth driving. You are maintaining a good balance.'); 
            break;
        case 30:
            cleanRes.push(nClean, ' instances of logged smooth driving. Good job, you have consistently driven well.'); 
            break;       
        case 40:
            cleanRes.push(nClean, ' instances of logged smooth driving. Excellent driving, this is showing good driving habits'); 
            break;
        default:
            cleanRes.push(nClean, ' instances of logged smooth driving. Amazing! This is the model of efficient driving');
            break;            
    }
    return [speedRes, rpmRes, loadRes, cleanRes];
}

module.exports = router;