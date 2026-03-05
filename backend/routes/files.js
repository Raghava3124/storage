const express = require('express');
const multer = require('multer');
const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const File = require('../models/File');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

let bot;
const getBot = () => {
    if (!bot) {
        try {
            bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
        } catch (err) {
            console.error('Error initializing Telegram Bot:', err);
        }
    }
    return bot;
};

// Upload a file
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const fileBuffer = req.file.buffer;
        const fileOptions = {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        };
        const caption = `Uploaded by: ${req.user.email} (#${req.user.email})`;

        const currentBot = getBot();
        if (!process.env.TELEGRAM_CHAT_ID || !currentBot) {
            return res.status(500).json({ error: 'Telegram bot not configured yet.' });
        }

        // Determine the type of file to send appropriately if desired, but sendDocument works for almost everything.
        const msg = await currentBot.sendDocument(process.env.TELEGRAM_CHAT_ID, fileBuffer, { caption }, fileOptions);

        // Telegram returns the file_id in msg.document (or msg.video, msg.photo)
        let fileId;
        if (msg.document) fileId = msg.document.file_id;
        else if (msg.video) fileId = msg.video.file_id;
        else if (msg.photo) fileId = msg.photo[msg.photo.length - 1].file_id; // get highest res
        else if (msg.audio) fileId = msg.audio.file_id;
        else return res.status(500).json({ error: 'Unsupported file type returned from Telegram' });

        const newFile = new File({
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            telegramFileId: fileId,
            telegramMessageId: msg.message_id,
            userEmail: req.user.email
        });

        await newFile.save();

        res.status(201).json({ message: 'File uploaded successfully', file: newFile });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Server error during file upload', details: error.message });
    }
});

// Get user's active files
router.get('/', authMiddleware, async (req, res) => {
    try {
        const files = await File.find({ userEmail: req.user.email, isDeleted: false }).sort({ uploadDate: -1 });
        res.json(files);
    } catch (error) {
        console.error('Fetch files error:', error);
        res.status(500).json({ error: 'Server error fetching files' });
    }
});

// Get user's trashed files
router.get('/trashed', authMiddleware, async (req, res) => {
    try {
        const files = await File.find({ userEmail: req.user.email, isDeleted: true }).sort({ deletedAt: -1 });
        res.json(files);
    } catch (error) {
        console.error('Fetch trashed files error:', error);
        res.status(500).json({ error: 'Server error fetching trashed files' });
    }
});

// Get total storage used by user (active + trashed)
router.get('/storage', authMiddleware, async (req, res) => {
    try {
        const storageData = await File.aggregate([
            { $match: { userEmail: req.user.email } },
            { $group: { _id: null, totalBytes: { $sum: '$fileSize' } } }
        ]);

        const totalBytes = storageData.length > 0 ? storageData[0].totalBytes : 0;
        res.json({ totalBytes });
    } catch (error) {
        console.error('Fetch storage error:', error);
        res.status(500).json({ error: 'Server error fetching storage' });
    }
});

// Soft delete file (Move to recycle bin)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const file = await File.findOneAndUpdate(
            { _id: req.params.id, userEmail: req.user.email },
            { isDeleted: true, deletedAt: Date.now() },
            { new: true }
        );

        if (!file) return res.status(404).json({ error: 'File not found or unauthorized' });

        // Update telegram caption if message ID is known
        if (file.telegramMessageId && process.env.TELEGRAM_CHAT_ID) {
            const currentBot = getBot();
            if (currentBot) {
                const newCaption = `Uploaded by: ${file.userEmail} (#${file.userEmail})\n\n[🗑️ MOVED TO RECYCLE BIN]`;
                try {
                    await currentBot.editMessageCaption(newCaption, {
                        chat_id: process.env.TELEGRAM_CHAT_ID,
                        message_id: file.telegramMessageId
                    });
                } catch (botErr) {
                    console.error('Failed to edit telegram caption on delete:', botErr.message);
                }
            }
        }

        res.json({ message: 'File moved to recycle bin', file });
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ error: 'Server error deleting file' });
    }
});

// Restore soft-deleted file
router.put('/restore/:id', authMiddleware, async (req, res) => {
    try {
        const file = await File.findOneAndUpdate(
            { _id: req.params.id, userEmail: req.user.email },
            { isDeleted: false, deletedAt: null },
            { new: true }
        );

        if (!file) return res.status(404).json({ error: 'File not found or unauthorized' });

        // Restore telegram caption if message ID is known
        if (file.telegramMessageId && process.env.TELEGRAM_CHAT_ID) {
            const currentBot = getBot();
            if (currentBot) {
                const originalCaption = `Uploaded by: ${file.userEmail} (#${file.userEmail})\n\n[✅ RESTORED]`;
                try {
                    await currentBot.editMessageCaption(originalCaption, {
                        chat_id: process.env.TELEGRAM_CHAT_ID,
                        message_id: file.telegramMessageId
                    });
                } catch (botErr) {
                    console.error('Failed to edit telegram caption on restore:', botErr.message);
                }
            }
        }

        res.json({ message: 'File restored successfully', file });
    } catch (error) {
        console.error('Restore file error:', error);
        res.status(500).json({ error: 'Server error restoring file' });
    }
});

// Permanent delete file (Hard Delete)
router.delete('/permanent/:id', authMiddleware, async (req, res) => {
    try {
        const file = await File.findOneAndDelete({ _id: req.params.id, userEmail: req.user.email });
        if (!file) return res.status(404).json({ error: 'File not found or unauthorized' });

        // Update telegram caption if message ID is known
        if (file.telegramMessageId && process.env.TELEGRAM_CHAT_ID) {
            const currentBot = getBot();
            if (currentBot) {
                const newCaption = `Uploaded by: ${file.userEmail} (#${file.userEmail})\n\n[❌ DELETED PERMANENTLY]`;
                try {
                    await currentBot.editMessageCaption(newCaption, {
                        chat_id: process.env.TELEGRAM_CHAT_ID,
                        message_id: file.telegramMessageId
                    });
                } catch (botErr) {
                    console.error('Failed to edit telegram caption on permanent delete:', botErr.message);
                }
            }
        }

        res.json({ message: 'File permanently deleted' });
    } catch (error) {
        console.error('Permanent delete file error:', error);
        res.status(500).json({ error: 'Server error permanently deleting file' });
    }
});

// Download/Stream a file
router.get('/download/:id', async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).json({ error: 'File not found' });

        // We do NOT use authMiddleware for this route if we are providing a temporary URL,
        // but we can add auth later, let's keep it simple or pass token in query if needed.
        // For now, let's allow fetching by ID since IDs are unguessable Object IDs.

        const currentBot = getBot();
        const fileLink = await currentBot.getFileLink(file.telegramFileId);

        // Set appropriate headers
        res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
        res.setHeader('Content-Type', file.fileType);

        // Stream the file directly from Telegram servers to the client
        https.get(fileLink, (stream) => {
            stream.pipe(res);
        }).on('error', (err) => {
            console.error('Streaming error:', err);
            res.status(500).json({ error: 'Error streaming file' });
        });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Server error during file download' });
    }
});

module.exports = router;
