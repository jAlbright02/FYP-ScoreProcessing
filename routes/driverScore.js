const express = require('express');
const router = express.Router();

router.post('/processFile', (req, res) => {
    const {processContent} = req.body
    if (!processContent) {
        return res.json({success: false, content: processContent})
    }
    return res.json({success: true})
});

module.exports = router;
