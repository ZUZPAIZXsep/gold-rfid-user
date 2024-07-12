const express = require('express');
const axios = require('axios');
const router = express.Router();
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const localizedFormat = require('dayjs/plugin/localizedFormat');
dayjs.extend(localizedFormat);
const { ObjectId } = require('mongoose').Types;
const rfidModule = require('../rfid_module/rfidReader');


// เชื่อมต่อกับ MongoDB
mongoose.connect('mongodb+srv://admin:1234@goldcluster.nf1xhez.mongodb.net/GoldRfid', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
const db = mongoose.connection;

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB database');
});

// สร้างโครงสร้างข้อมูล gold_data_tag
const goldTagSchema = new mongoose.Schema({
 
  gold_id: ObjectId,
  gold_type: String,
  gold_size: String,
  gold_weight: String,
  has_data: Boolean,
  gold_tray: String
},{ 
  collection: 'gold_data_tag' 
});

const GoldTag = mongoose.model('GoldTag', goldTagSchema);

// สร้างโครงสร้างข้อมูล goldcount_history
const goldCountHistorySchema = new mongoose.Schema({

  gold_id: ObjectId,
  gold_type: String,
  gold_size: String,
  gold_weight: String,
  gold_tray: String,
  gold_timestamp: { type: Date, default: Date.now },
  gold_status: String,
  gold_outDateTime: Date,
  customer_name: String,
  customer_surname: String,
  customer_phone: String,
  gold_price: String

},{ 
  collection: 'goldcount_history'
});

const Goldhistory = mongoose.model('Goldhistory', goldCountHistorySchema);

// สร้างโครงสร้างข้อมูล goldtags_count
const goldTagsCountSchema = new mongoose.Schema({

  gold_id: ObjectId,
  gold_type: String,
  gold_size: String,
  gold_weight: String,
  gold_tray: String,
  gold_timestamp: { type: Date, default: Date.now },
  gold_status: String,
  gold_outDateTime: Date,
  gold_price: String
  
},{ 
  collection: 'goldtags_count'
});

const Goldtagscount = mongoose.model('Goldtagscount', goldTagsCountSchema);

// ฟังก์ชันสำหรับจัดถาด
function assignTray(gold_type) {
  switch(gold_type) {
    case 'สร้อยคอ':
      return 'ถาดที่ 1';
    case 'แหวน':
      return 'ถาดที่ 2';
    case 'กำไลข้อมือ':
      return 'ถาดที่ 3';
    case 'สร้อยข้อมือ':
      return 'ถาดที่ 4';
    case 'ต่างหู':
      return 'ถาดที่ 5';
    default:
      return 'ถาดอื่นๆ';
  }
}

/* GET home page. */
router.get('/', async (req, res, next) => {
  try {
    let condition = {};
    const golds = await Goldtagscount.find(condition);

    // เรียงข้อมูลตามลำดับถาด
      golds.sort((a, b) => {
      const trayOrder = {
        'ถาดที่ 1': 1,
        'ถาดที่ 2': 2,
        'ถาดที่ 3': 3,
        'ถาดที่ 4': 4,
        'ถาดที่ 5': 5,
        'ถาดอื่นๆ': 6
      };

      return trayOrder[a.gold_tray] - trayOrder[b.gold_tray];
    });

    res.render('index', { golds: golds, dayjs: dayjs, currentUrl: req.originalUrl });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/count_goldtags', async (req, res) => {
  try {
    let countgoldtags = [];
    let rfidTags = rfidModule.getRfidTags(); // เรียกใช้งาน rfidTags จาก rfidModule
    
    // ดึงข้อมูลจาก database ที่มี gold_id ตรงกับ rfidTags
    countgoldtags = await GoldTag.find({ gold_id: { $in: rfidTags } });

    // เพิ่มการจัดถาดให้กับทองคำแต่ละชนิด
    countgoldtags = countgoldtags.map(tag => {
      return {
        ...tag._doc,
        gold_tray: assignTray(tag.gold_type)
      };
    });

    // เรียงข้อมูลตามลำดับถาด
    countgoldtags.sort((a, b) => {
      const trayOrder = {
        'ถาดที่ 1': 1,
        'ถาดที่ 2': 2,
        'ถาดที่ 3': 3,
        'ถาดที่ 4': 4,
        'ถาดที่ 5': 5,
        'ถาดอื่นๆ': 6
      };

      return trayOrder[a.gold_tray] - trayOrder[b.gold_tray];
    });

    res.render('count_goldtags', {
      countgoldtags: countgoldtags,
      dayjs: dayjs, 
      currentUrl: req.originalUrl
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/save_goldtags', async (req, res) => {
  try {
      // ดึงข้อมูลจาก database ที่มี gold_id ตรงกับ rfidTags
      let rfidTags = rfidModule.getRfidTags(); // เรียกใช้งาน rfidTags จาก rfidModule
      let countgoldtags = await GoldTag.find({ gold_id: { $in: rfidTags } });

      // สร้าง object ที่จะบันทึกลงใน collection `goldtags_count`
      let newGoldtagscount = countgoldtags.map(count_tag => ({
          gold_id: count_tag.gold_id,
          gold_type: count_tag.gold_type,
          gold_size: count_tag.gold_size,
          gold_weight: count_tag.gold_weight,
          gold_tray: assignTray(count_tag.gold_type),
          gold_timestamp: dayjs().locale('th').format('YYYY-MM-DD HH:mm:ss'), // Timestamp ปัจจุบัน (รูปแบบวันที่และเวลาไทย)
          gold_status: 'in stock' // เพิ่มสถานะ
      }));

      // ลบข้อมูลเก่าออกก่อน
      await Goldtagscount.deleteMany({});
      // บันทึกข้อมูลใน collection `goldtags_count`
      await Goldtagscount.insertMany(newGoldtagscount);

      // เพิ่มฟังก์ชันในการบันทึกลงใน collection `goldhistory`
      let currentDate = dayjs().locale('th').startOf('day').toDate(); // เริ่มต้นวันปัจจุบัน
      let endOfCurrentDate = dayjs().locale('th').endOf('day').toDate(); // สิ้นสุดวันปัจจุบัน

      // ลบข้อมูลเก่าที่เป็นวันเดียวกันทั้งหมดก่อน
      await Goldhistory.deleteMany({
          gold_timestamp: {
              $gte: currentDate,
              $lte: endOfCurrentDate
          }
      });

      // เพิ่มข้อมูลใหม่
      await Goldhistory.insertMany(newGoldtagscount);

      res.json({ message: 'บันทึกรายการเรียบร้อยแล้ว' });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});

  router.get('/clear_goldtags_count', async (req, res) => {
    try {
        await Goldtagscount.deleteMany({}); // ลบข้อมูลทั้งหมดใน collection `goldtags_count`
        res.json({ message: 'ลบข้อมูลการนับทั้งหมดเรียบร้อยแล้ว' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/gold_list', async (req, res, next) => {
    try {
        let condition = { gold_status: 'in stock' }; // เพิ่มเงื่อนไขการกรองโดย gold_status
  
        // ถ้ามีการเลือกประเภททองคำ
        if (req.query.select_goldType && req.query.select_goldType !== 'เลือกประเภททองคำ') {
            condition.gold_type = req.query.select_goldType;
        }
  
        // ถ้ามีการเลือกขนาดทองคำ
        if (req.query.select_goldSize && req.query.select_goldSize !== 'เลือกขนาดทองคำ') {
            condition.gold_size = req.query.select_goldSize;
        }
  
        // ถ้ามีการกรอกเลข Gold ID
        if (req.query.gold_id) {
          condition.gold_id = req.query.gold_id;
        }
        
        const goldslist = await Goldtagscount.find(condition);
  
        // เรียงข้อมูลตามลำดับถาด
        goldslist.sort((a, b) => {
        const trayOrder = {
          'ถาดที่ 1': 1,
          'ถาดที่ 2': 2,
          'ถาดที่ 3': 3,
          'ถาดที่ 4': 4,
          'ถาดที่ 5': 5,
          'ถาดอื่นๆ': 6
        };
  
        return trayOrder[a.gold_tray] - trayOrder[b.gold_tray];
      });

        const dataUrl = 'http://www.thaigold.info/RealTimeDataV2/gtdata_.txt';

        const response = await axios.get(dataUrl);
        const data = response.data;

        // console.log('Data from API:', data);

        const pricePerGram = parseFloat(data[5]?.bid); // ราคาเสนอซื้อของทองคำ 96.5%

        if (isNaN(pricePerGram)) {
            console.error('pricePerGram is not a valid number:', pricePerGram);
            res.status(500).send('Invalid price data from API');
            return;
        }

        // คำนวณราคาทองคำตามน้ำหนักต่างๆ
        const prices = {
            halfSalung: pricePerGram * 3.81 / 15.244 / 2,
            oneSalung: pricePerGram * 3.81 / 15.244,
            twoSalung: pricePerGram * 3.81 * 2 / 15.244,
            oneBaht: pricePerGram,
            twoBaht: pricePerGram * 2,
            threeBaht: pricePerGram * 3
        };

        const updateTime = data[0]?.ask; // เวลาที่แสดงในดัชนีที่ [0] และคีย์ 'ask'
        
        res.render('gold_list', { 
          goldslist: goldslist, 
          dayjs: dayjs, 
          select_goldType: req.query.select_goldType, 
          select_goldSize: req.query.select_goldSize,
          _id: req.query._id,
          gold_id: req.query.gold_id, 
          currentUrl: req.originalUrl,
          prices,
          updateTime
         });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
  });
  
  router.post('/update_goldstatus', async (req, res) => {
    try {
        const { gold_id, gold_price, customer_name, customer_surname, customer_phone } = req.body;
        const currentTimestamp = dayjs().locale('th').format('YYYY-MM-DD HH:mm:ss');

        // Update gold_status and gold_outDateTime in Goldtagscount collection
        const result = await Goldtagscount.updateOne(
          { gold_id: gold_id },
          {
              $set: {
                  gold_status: 'out of stock',
                  gold_price: gold_price,
                  gold_outDateTime: currentTimestamp
              },
          }
      );

        // Find the most recent Goldhistory document for the given gold_id
        let existingGold = await Goldhistory.findOne({ gold_id: gold_id }).sort({ gold_timestamp: -1 });

        if (existingGold) {
            // Update existing document
            existingGold.customer_name = customer_name;
            existingGold.customer_surname = customer_surname;
            existingGold.customer_phone = customer_phone;
            existingGold.gold_status = 'out of stock';
            existingGold.gold_price = gold_price;
            existingGold.gold_outDateTime = currentTimestamp;
            await existingGold.save();
        } else {
            // Create new document in Goldhistory
            await Goldhistory.create({
                gold_id: gold_id,
                gold_status: 'out of stock',
                gold_outDateTime: currentTimestamp,
                customer_name: customer_name,
                customer_surname: customer_surname,
                customer_phone: customer_phone,
                gold_price: gold_price,
                gold_timestamp: currentTimestamp,
            });
        }
        console.log(existingGold);
        res.redirect('/gold_list'); // Redirect to the gold list page after updating

    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

const ITEMS_PER_PAGE = 15;

router.get('/gold_salesHistory', async (req, res, next) => {
  try {
      let condition = { gold_status: 'out of stock' }; // Initial condition for out of stock items

      // Filter conditions based on query parameters
      if (req.query.select_goldType && req.query.select_goldType !== 'เลือกประเภททองคำ') {
          condition.gold_type = req.query.select_goldType;
      }
      if (req.query.select_goldSize && req.query.select_goldSize !== 'เลือกขนาดทองคำ') {
          condition.gold_size = req.query.select_goldSize;
      }
      if (req.query.gold_id && req.query.gold_id.trim().length > 0) {
          condition.gold_id = req.query.gold_id.trim();
      }
      if (req.query.start_date && req.query.end_date) {
          const startDate = new Date(req.query.start_date);
          const endDate = new Date(req.query.end_date);
          condition.gold_outDateTime = {
              $gte: startDate,
              $lt: dayjs(endDate).endOf('day').toDate() // End of day for endDate
          };
      } else if (req.query.start_date) {
          const startDate = new Date(req.query.start_date);
          condition.gold_outDateTime = { $gte: startDate };
      } else if (req.query.end_date) {
          const endDate = new Date(req.query.end_date);
          condition.gold_outDateTime = { $lt: dayjs(endDate).endOf('day').toDate() };
      }

      // Pagination logic
      const page = parseInt(req.query.page) || 1;
      const skip = (page - 1) * ITEMS_PER_PAGE;

      const allRecords = await Goldhistory.find(condition)
          .sort({ gold_outDateTime: -1 })
          .skip(skip)
          .limit(ITEMS_PER_PAGE);

      const totalItems = await Goldhistory.countDocuments(condition);

      // Create query parameters string without the page parameter
      const queryParams = new URLSearchParams(req.query);
      queryParams.delete('page');

      res.render('gold_salesHistory', {
        goldshistory: allRecords,
        dayjs: dayjs,
        select_goldType: req.query.select_goldType,
        select_goldSize: req.query.select_goldSize,
        startDate: req.query.start_date,
        endDate: req.query.end_date,
        gold_id: req.query.gold_id,
        currentUrl: req.originalUrl,
        totalPages: Math.ceil(totalItems / ITEMS_PER_PAGE),
        currentPage: page,
        queryParams: queryParams.toString(),
    });

  } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
  }
});

router.get('/gold_saleDetails', async (req, res, next) => {
try {
    const goldId = req.query.gold_id;
    console.log("Gold ID:", goldId);  // ตรวจสอบว่า gold_id ถูกส่งมาถูกต้องหรือไม่

    const saleDetails = await Goldhistory.findOne({ _id: goldId, gold_status: 'out of stock' });

    if (saleDetails) {
        console.log("Sale Details:", saleDetails);  // ตรวจสอบผลลัพธ์จากฐานข้อมูล

        res.json({
            customer_name: saleDetails.customer_name,
            customer_surname: saleDetails.customer_surname,
            customer_phone: saleDetails.customer_phone,
            gold_outDateTime: dayjs(saleDetails.gold_outDateTime).locale('th').format('DD-MM-YYYY HH:mm:ss'),
            gold_price: saleDetails.gold_price
        });
    } else {
        res.status(404).json({ error: 'Sale details not found' });
    }
} catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
}
});

router.get('/gold_history', async (req, res, next) => {
try {
    let condition = {};

    // ถ้ามีการเลือกประเภททองคำ
    if (req.query.select_goldType && req.query.select_goldType !== 'เลือกประเภททองคำ') {
        condition.gold_type = req.query.select_goldType;
    }

    // ถ้ามีการเลือกขนาดทองคำ
    if (req.query.select_goldSize && req.query.select_goldSize !== 'เลือกขนาดทองคำ') {
        condition.gold_size = req.query.select_goldSize;
    }

    if (req.query.gold_id && req.query.gold_id.trim().length > 0) {
        condition.gold_id = req.query.gold_id.trim();
    }

    // ถ้ามีการเลือกวันที่เริ่มต้นและสิ้นสุด
    if (req.query.start_date && req.query.end_date) {
        const startDate = new Date(req.query.start_date);
        const endDate = new Date(req.query.end_date);

        // ถ้าวันที่เริ่มต้นและสิ้นสุดเป็นวันเดียวกัน
        if (startDate.toDateString() === endDate.toDateString()) {
            condition.gold_timestamp = {
                $gte: startDate,
                $lt: dayjs(endDate).add(1, 'day').toDate() // เพิ่ม 1 วันเพื่อให้ครอบคลุมทั้งวัน
            };
        } else {
            // ถ้าวันที่เริ่มต้นและสิ้นสุดเป็นคนละวัน
            condition.gold_timestamp = {
                $gte: startDate,
                $lt: dayjs(endDate).add(1, 'day').toDate() // เพิ่ม 1 วันเพื่อให้ครอบคลุมทั้งวันสิ้นสุด
            };
        }
    } else if (req.query.start_date) {
        // ถ้ามีการเลือกแค่วันที่เริ่มต้น
        const startDate = new Date(req.query.start_date);
        condition.gold_timestamp = { $gte: startDate };
    } else if (req.query.end_date) {
        // ถ้ามีการเลือกแค่วันที่สิ้นสุด
        const endDate = new Date(req.query.end_date);
        condition.gold_timestamp = { $lt: dayjs(endDate).add(1, 'day').toDate() };
    }

    // Get the latest date in the database
    const latestRecord = await Goldhistory.findOne().sort({ gold_timestamp: -1 }).exec();
    const latestDate = latestRecord ? latestRecord.gold_timestamp : null;

    // Pagination logic
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * ITEMS_PER_PAGE;

    // เพิ่มการค้นหาทองที่มีสถานะเป็น in stock ในแต่ละวัน
    const allRecords = await Goldhistory.find(condition)
        .sort({ gold_timestamp: -1, gold_tray: 1 })  // เรียงตาม gold_timestamp และ gold_tray
        .skip(skip)
        .limit(ITEMS_PER_PAGE);

    const totalItems = await Goldhistory.countDocuments(condition);

    // Create query parameters string without the page parameter
    const queryParams = new URLSearchParams(req.query);
    queryParams.delete('page');

    // นับจำนวนทองคำที่มีสถานะเป็น in stock ในแต่ละวัน
    const allInStockRecords = await Goldhistory.find({ gold_status: 'in stock' });

    const dailyInStockMap = {};
    allInStockRecords.forEach(item => {
        const dateKey = `${item.gold_timestamp.getFullYear()}-${item.gold_timestamp.getMonth() + 1}-${item.gold_timestamp.getDate()}`;
        if (!dailyInStockMap[dateKey]) {
            dailyInStockMap[dateKey] = 0;
        }
        dailyInStockMap[dateKey] += 1;
    });

    res.render('gold_history', { 
        goldshistory: allRecords, 
        dayjs: dayjs, 
        select_goldType: req.query.select_goldType, 
        select_goldSize: req.query.select_goldSize,
        gold_id: req.query.gold_id,
        startDate: req.query.start_date,
        endDate: req.query.end_date,
        currentUrl: req.originalUrl,
        totalPages: Math.ceil(totalItems / ITEMS_PER_PAGE),
        currentPage: page,
        latestDate: latestDate,
        queryParams: queryParams.toString(),
        dailyInStockMap: dailyInStockMap // ส่งข้อมูลจำนวนทองคำไปยัง EJS
    });

} catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
}
});

module.exports = router;
