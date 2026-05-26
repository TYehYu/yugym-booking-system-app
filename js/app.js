/*
  YUGYM 有肌訓練預約系統 - 主要互動邏輯
  ------------------------------------------------------------
  這份檔案負責資料、預約規則、票券計算、會員管理、課程管理、教練管理與畫面互動。
  目前是可展示的前端原型，資料主要儲存在瀏覽器本機；未來接 Supabase 時，可優先整理儲存層。

  維護提醒：
  1. 預約容量、教練衝堂、友善課時段等規則集中在 validateSelection / validateBookingMove 附近。
  2. 會員票券、續約、分期與儲值邏輯集中在 recharge、ticket bucket、booking progress 相關函式。
  3. 行事曆卡片排列與拖曳移動集中在 renderCalendar / arrangeBookingLanes / moveBookingToSlot。
*/
const SUPABASE_URL = "";
    const SUPABASE_ANON_KEY = "";
    const DEMO_DATA_MODE = true;
    const SUPABASE_STATE_ID = "yugym-booking-system-demo-v1";

    // 行事曆目前以 2026/05/18 這週做為展示基準；切換週次時會用 weekOffset 推算日期。
    const days = [
      { key: "mon", label: "週一", date: "05/18", weekday: true, past: true },
      { key: "tue", label: "週二", date: "05/19", weekday: true, past: true },
      { key: "wed", label: "週三", date: "05/20", weekday: true, past: true },
      { key: "thu", label: "週四", date: "05/21", weekday: true, past: true },
      { key: "fri", label: "週五", date: "05/22", weekday: true, today: true },
      { key: "sat", label: "週六", date: "05/23", weekday: false },
      { key: "sun", label: "週日", date: "05/24", weekday: false }
    ];

    const times = Array.from({ length: 26 }, (_, index) => {
      const hour = 9 + Math.floor(index / 2);
      const minute = index % 2 === 0 ? "00" : "30";
      return `${String(hour).padStart(2, "0")}:${minute}`;
    });

    // 展示版預設預約資料。正式上線後，這區會改成從資料庫讀取。
    const bookings = [
      { day: "mon", time: "09:00", memberIds: ["m001"], kind: "friendly", title: "友善教練課 1v1", detail: "林小姐 / Coach Amy", people: 1, general: 1, groupSlot: 0 },
      { day: "mon", time: "18:00", memberIds: ["m002"], kind: "coaching", title: "教練課 1v2", detail: "王小明、陳小華 / Coach Ken", people: 2, general: 1, groupSlot: 0 },
      { day: "mon", time: "18:00", memberIds: [], kind: "self", title: "自主訓練", detail: "張先生", people: 1, general: 1, groupSlot: 0 },
      { day: "tue", time: "19:00", memberIds: ["m001", "m004", "m005"], kind: "group", title: "小班團體課", detail: "臀腿訓練 / Coach Amy，3/5 人", people: 3, general: 0, groupSlot: 1 },
      { day: "wed", time: "14:00", memberIds: ["m004"], kind: "friendly", title: "友善教練課 1v2", detail: "黃先生、李小姐 / Coach Leo", people: 2, general: 1, groupSlot: 0 },
      { day: "wed", time: "20:00", memberIds: ["m003"], kind: "self", title: "自主訓練", detail: "陳小姐", people: 1, general: 1, groupSlot: 0 },
      { day: "thu", time: "18:00", memberIds: [], kind: "coaching", title: "教練課 1v1", detail: "趙先生 / Coach Ken", people: 1, general: 1, groupSlot: 0 },
      { day: "thu", time: "18:00", memberIds: [], kind: "coaching", title: "教練課 1v2", detail: "許小姐、吳先生 / Coach Amy", people: 2, general: 1, groupSlot: 0 },
      { day: "thu", time: "18:00", memberIds: [], kind: "self", title: "自主訓練", detail: "高先生", people: 1, general: 1, groupSlot: 0 },
      { day: "fri", time: "10:00", memberIds: ["m005"], kind: "friendly", title: "友善教練課 1v1", detail: "新會員體驗 / Coach Leo", people: 1, general: 1, groupSlot: 0 },
      { day: "fri", time: "19:00", memberIds: ["m001", "m002", "m003", "m004"], kind: "group", title: "小班團體課", detail: "上肢訓練 / Coach Ken，4/5 人", people: 4, general: 0, groupSlot: 1 },
      { day: "sat", time: "11:00", memberIds: [], kind: "coaching", title: "教練課 1v1", detail: "周先生 / Coach Amy", people: 1, general: 1, groupSlot: 0 }
    ];

    bookings.forEach(booking => {
      booking.checkIns = booking.checkIns || [];
    });

    // 展示版預設會員資料；真實會員資料不應直接放在前端檔案中。
    const members = [
      { id: "m001", name: "林小姐", phone: "0912-345-001", identity: "老顧客", plan: "教練課票券", tickets: 3, expiresAt: "2026/06/30", status: "正常" },
      { id: "m002", name: "王小明", phone: "0912-345-002", identity: "VIP", plan: "教練課票券", tickets: 8, expiresAt: "2026/07/15", status: "正常" },
      { id: "m003", name: "陳小姐", phone: "0912-345-003", identity: "老顧客", plan: "自主訓練月票", tickets: 0, expiresAt: "2026/06/05", status: "月票" },
      { id: "m004", name: "黃先生", phone: "0912-345-004", identity: "新客", plan: "友善教練課", tickets: 2, expiresAt: "2026/06/20", status: "低堂數" },
      { id: "m005", name: "新預約客人", phone: "未填", identity: "新客", plan: "體驗 / 待開票", tickets: 0, expiresAt: "未設定", status: "待處理" }
    ];

    function defaultMemberSeed() {
      return [
        {
          id: "m001",
          name: "林小姐",
          phone: "0912345001",
          identity: "老顧客",
          plan: "教練課 1V1",
          tickets: 3,
          expiresAt: "2026/06/30",
          status: "正常",
          registeredAt: "2026/05/01",
          gender: "女",
          birthday: "1991/03/12",
          lineId: "lin_training",
          ticketWallet: { course: 3, selfTraining: 0, group: 0, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m001-course", type: "course", label: "教練1", total: 4, remaining: 3, used: 1, isBonus: false, createdAt: "2026/05/01" }]
        },
        {
          id: "m002",
          name: "王小明",
          phone: "0912345002",
          identity: "VIP",
          plan: "VIP 教練課",
          tickets: 8,
          expiresAt: "2026/07/15",
          status: "正常",
          registeredAt: "2026/05/02",
          gender: "男",
          birthday: "1988/10/08",
          lineId: "wang_vip",
          ticketWallet: { course: 8, selfTraining: 0, group: 0, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m002-course", type: "course", label: "教練1", total: 10, remaining: 8, used: 2, isBonus: false, createdAt: "2026/05/02" }]
        },
        {
          id: "m003",
          name: "陳小姐",
          phone: "0912345003",
          identity: "老顧客",
          plan: "自主訓練",
          tickets: 0,
          expiresAt: "2026/06/05",
          status: "月票",
          registeredAt: "2026/05/03",
          gender: "女",
          birthday: "1994/07/21",
          lineId: "chen_self",
          ticketWallet: { course: 0, selfTraining: 8, group: 0, massage: 0 },
          ticketExpiry: { selfTraining: "2026/06/05", group: "" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m003-self", type: "selfTraining", label: "自主", total: 10, remaining: 8, used: 2, isBonus: false, createdAt: "2026/05/03" }]
        },
        {
          id: "m004",
          name: "黃先生",
          phone: "0912345004",
          identity: "新客",
          plan: "友善教練課 1V1",
          tickets: 2,
          expiresAt: "2026/06/20",
          status: "低堂數",
          registeredAt: "2026/05/04",
          gender: "男",
          birthday: "1990/12/01",
          lineId: "huang_friendly",
          ticketWallet: { course: 2, selfTraining: 0, group: 0, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m004-course", type: "course", label: "友善1", total: 4, remaining: 2, used: 2, isBonus: false, createdAt: "2026/05/04" }]
        },
        {
          id: "m005",
          name: "吳小姐",
          phone: "0912345005",
          identity: "新客",
          plan: "小班團體課",
          tickets: 0,
          expiresAt: "2026/06/30",
          status: "正常",
          registeredAt: "2026/05/05",
          gender: "女",
          birthday: "1996/01/18",
          lineId: "wu_group",
          ticketWallet: { course: 0, selfTraining: 0, group: 6, massage: 1 },
          ticketExpiry: { selfTraining: "", group: "2026/06/30" },
          rechargeHistory: [],
          ticketBuckets: [
            { id: "m005-group", type: "group", label: "團課", total: 10, remaining: 6, used: 4, isBonus: false, createdAt: "2026/05/05" },
            { id: "m005-massage", type: "massage", label: "運動按摩", total: 1, remaining: 1, used: 0, isBonus: false, createdAt: "2026/05/05" }
          ]
        },
        {
          id: "m006",
          name: "余大東",
          phone: "0912345006",
          identity: "新客",
          plan: "新客教練課 1V1",
          tickets: 8,
          expiresAt: "2026/07/05",
          status: "正常",
          registeredAt: "2026/05/06",
          gender: "男",
          birthday: "1992/04/16",
          lineId: "yu_training",
          ticketWallet: { course: 8, selfTraining: 0, group: 0, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m006-course", type: "course", label: "教練1", total: 8, remaining: 8, used: 0, isBonus: false, createdAt: "2026/05/06" }]
        },
        {
          id: "m007",
          name: "張小姐",
          phone: "0912345007",
          identity: "老顧客",
          plan: "續約教練課 1V2",
          tickets: 12,
          expiresAt: "2026/08/01",
          status: "正常",
          registeredAt: "2026/05/07",
          gender: "女",
          birthday: "1989/09/09",
          lineId: "chang_pair",
          ticketWallet: { course: 12, selfTraining: 0, group: 0, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m007-course", type: "course", label: "教練2", total: 12, remaining: 12, used: 0, isBonus: false, createdAt: "2026/05/07" }]
        },
        {
          id: "m008",
          name: "李先生",
          phone: "0912345008",
          identity: "VIP",
          plan: "VIP 教練課",
          tickets: 20,
          expiresAt: "2026/09/01",
          status: "正常",
          registeredAt: "2026/05/08",
          gender: "男",
          birthday: "1985/11/23",
          lineId: "lee_vip",
          ticketWallet: { course: 20, selfTraining: 0, group: 0, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m008-course", type: "course", label: "教練1", total: 20, remaining: 20, used: 0, isBonus: false, createdAt: "2026/05/08" }]
        },
        {
          id: "m009",
          name: "周小姐",
          phone: "0912345009",
          identity: "新客",
          plan: "友善教練課 1V2",
          tickets: 12,
          expiresAt: "2026/07/20",
          status: "正常",
          registeredAt: "2026/05/09",
          gender: "女",
          birthday: "1997/02/14",
          lineId: "chou_friendly",
          ticketWallet: { course: 12, selfTraining: 0, group: 0, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m009-course", type: "course", label: "友善2", total: 12, remaining: 12, used: 0, isBonus: false, createdAt: "2026/05/09" }]
        },
        {
          id: "m010",
          name: "林先生",
          phone: "0912345010",
          identity: "老顧客",
          plan: "團課一般方案",
          tickets: 0,
          expiresAt: "2026/07/15",
          status: "正常",
          registeredAt: "2026/05/10",
          gender: "男",
          birthday: "1993/06/30",
          lineId: "lin_group",
          ticketWallet: { course: 0, selfTraining: 0, group: 10, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "2026/07/15" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m010-group", type: "group", label: "團課", total: 10, remaining: 10, used: 0, isBonus: false, createdAt: "2026/05/10" }]
        },
        {
          id: "m012",
          name: "郭小姐",
          phone: "0912345012",
          identity: "會員",
          plan: "團課一般方案",
          tickets: 0,
          expiresAt: "2026/07/06",
          status: "正常",
          registeredAt: "2026/05/12",
          gender: "女",
          birthday: "1995/08/19",
          lineId: "kuo_group",
          ticketWallet: { course: 0, selfTraining: 0, group: 8, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "2026/07/06" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m012-group", type: "group", label: "團課", total: 10, remaining: 8, used: 2, isBonus: false, createdAt: "2026/05/12" }]
        },
        {
          id: "m013",
          name: "胡先生",
          phone: "0912345013",
          identity: "新朋友",
          plan: "團課體驗與一般方案",
          tickets: 0,
          expiresAt: "2026/07/08",
          status: "正常",
          registeredAt: "2026/05/13",
          gender: "男",
          birthday: "1991/11/05",
          lineId: "hu_group",
          ticketWallet: { course: 0, selfTraining: 0, group: 4, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "2026/07/08" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m013-group", type: "group", label: "團課", total: 4, remaining: 4, used: 0, isBonus: false, createdAt: "2026/05/13" }]
        },
        {
          id: "m014",
          name: "蔡小姐",
          phone: "0912345014",
          identity: "主顧客",
          plan: "期班團課",
          tickets: 0,
          expiresAt: "2026/07/10",
          status: "低堂數",
          registeredAt: "2026/05/14",
          gender: "女",
          birthday: "1987/03/28",
          lineId: "tsai_group",
          ticketWallet: { course: 0, selfTraining: 0, group: 2, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "2026/07/10" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m014-group", type: "group", label: "團課", total: 10, remaining: 2, used: 8, isBonus: false, createdAt: "2026/05/14" }]
        },
        {
          id: "m015",
          name: "何小姐",
          phone: "0912345015",
          identity: "會員",
          plan: "團課一般方案",
          tickets: 0,
          expiresAt: "2026/07/12",
          status: "正常",
          registeredAt: "2026/05/15",
          gender: "女",
          birthday: "1998/12/22",
          lineId: "ho_group",
          ticketWallet: { course: 0, selfTraining: 0, group: 12, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "2026/07/12" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m015-group", type: "group", label: "團課", total: 12, remaining: 12, used: 0, isBonus: false, createdAt: "2026/05/15" }]
        },
        {
          id: "m016",
          name: "許先生",
          phone: "0912345016",
          identity: "會員",
          plan: "團課一般方案",
          tickets: 0,
          expiresAt: "2026/07/15",
          status: "低堂數",
          registeredAt: "2026/05/16",
          gender: "男",
          birthday: "1990/05/07",
          lineId: "hsu_group",
          ticketWallet: { course: 0, selfTraining: 0, group: 3, massage: 0 },
          ticketExpiry: { selfTraining: "", group: "2026/07/15" },
          rechargeHistory: [],
          ticketBuckets: [{ id: "m016-group", type: "group", label: "團課", total: 10, remaining: 3, used: 7, isBonus: false, createdAt: "2026/05/16" }]
        }
      ];
    }

    members.splice(0, members.length, ...defaultMemberSeed());

    members.forEach(member => {
      member.identity = normalizeIdentity(member.identity || "新朋友");
      member.ticketWallet = member.ticketWallet || {
        course: member.tickets,
        selfTraining: member.plan.includes("自主") ? 8 : 0,
        group: 0,
        massage: 0
      };
      member.bonusWallet = member.bonusWallet || {
        course: 0,
        group: 0
      };
      member.ticketExpiry = member.ticketExpiry || {
        selfTraining: member.plan.includes("自主") ? member.expiresAt : "",
        group: ""
      };
      member.registeredAt = member.registeredAt || "2026/05/01";
      member.gender = member.gender || "";
      member.birthday = member.birthday || "";
      member.lineId = member.lineId || "";
      member.lastBookingAt = member.lastBookingAt || "";
      member.importNote = member.importNote || "";
      member.rechargeHistory = member.rechargeHistory || [];
      member.ticketBuckets = member.ticketBuckets || [];
      if (!member.ticketBuckets.length) {
        if (member.ticketWallet.course) {
          member.ticketBuckets.push({
            id: `${member.id}-initial-course`,
            type: "course",
            label: String(member.plan || "").includes("友善") ? "友善1" : "教練1",
            total: member.ticketWallet.course,
            remaining: member.ticketWallet.course,
            used: 0,
            isBonus: false,
            createdAt: member.registeredAt || "2026/05/01"
          });
        }
        if (member.ticketWallet.selfTraining) {
          member.ticketBuckets.push({
            id: `${member.id}-initial-self`,
            type: "selfTraining",
            label: "自主",
            total: member.ticketWallet.selfTraining,
            remaining: member.ticketWallet.selfTraining,
            used: 0,
            isBonus: false,
            createdAt: member.registeredAt || "2026/05/01"
          });
        }
      }
    });

    const activityLogs = [];

    // 課程代表「可被預約的項目」，票券代表「會員可用來預約的餘額」。
    const courseItems = [
      { id: "c-coach-1v1", name: "教練課1V1", kind: "coaching", ticketType: "course", timeRule: "all" },
      { id: "c-coach-1v2", name: "教練課1V2", kind: "coaching", ticketType: "course", timeRule: "all" },
      { id: "c-friendly-1v1", name: "友善教練課1V1", kind: "coaching", ticketType: "course", timeRule: "weekdayOffPeak" },
      { id: "c-friendly-1v2", name: "友善教練課1V2", kind: "coaching", ticketType: "course", timeRule: "weekdayOffPeak" },
      { id: "c-self-training", name: "自主訓練", kind: "self", ticketType: "selfTraining", timeRule: "all" },
      { id: "c-small-strength", name: "小班肌力", kind: "group", ticketType: "group", timeRule: "all" }
    ];

    const ticketItems = [
      { id: "t-course", name: "教練課", type: "course", count: 1 },
      { id: "t-friendly", name: "友善教練課", type: "course", count: 12 },
      { id: "t-group", name: "團體課", type: "group", count: 1 },
      { id: "t-self", name: "自主訓練", type: "selfTraining", count: 2 },
      { id: "t-friendly-self", name: "友善自主", type: "friendlySelfTraining", count: 2 },
      { id: "t-bonus-course", name: "贈送教練課", type: "course", count: 1, isBonus: true }
    ];

    const staffMembers = [
      {
        id: "s001",
        name: "Randy",
        displayName: "Randy",
        role: "正職教練",
        phone: "0912-210-001",
        status: "在職",
        startDate: "2024/03/01",
        payNote: "月薪制，另計團課與續約獎金",
        classTypes: ["教練課", "小班團課", "友善方案"],
        schedule: ["週一 12:00-21:00", "週四 12:00-21:00", "週五 15:00-21:00"],
        clockRequired: true,
        clockRecords: ["05/20 11:54-21:08", "05/21 12:03-21:01", "05/22 尚未退勤"],
        alerts: ["今日尚未完成退勤", "本週已有 2 位學員剩最後一堂，請協助續約提醒"]
      },
      {
        id: "s002",
        name: "Sandy",
        displayName: "Sandy",
        role: "店長",
        phone: "0912-210-002",
        status: "在職",
        startDate: "2024/08/12",
        payNote: "月薪制，負責營運、排班與月結",
        classTypes: ["排班管理", "會員關係", "營運檢核"],
        schedule: ["週一 09:00-18:00", "週二 18:00-21:00", "週六 10:00-15:00"],
        clockRequired: true,
        clockRecords: [],
        alerts: ["月底前需確認薪資與合作教練拆帳"]
      },
      {
        id: "s003",
        name: "Mango",
        displayName: "Mango",
        role: "正職教練",
        phone: "0912-210-003",
        status: "在職",
        startDate: "2025/01/10",
        payNote: "月薪制，另計堂數獎金",
        classTypes: ["教練課", "小班團課", "友善方案"],
        schedule: ["週三 13:00-18:00", "週五 09:00-14:00"],
        clockRequired: true,
        clockRecords: [],
        alerts: ["本週可協助承接友善方案離峰時段"]
      },
      {
        id: "s004",
        name: "Barry",
        displayName: "Barry",
        role: "兼職教練",
        phone: "0912-210-004",
        status: "在職",
        startDate: "2025/06/01",
        payNote: "按堂計酬，團課另計人次獎金",
        classTypes: ["教練課", "小班團課"],
        schedule: ["週一 09:00-18:00", "週三 09:00-18:00", "週五 09:00-18:00"],
        clockRequired: false,
        clockRecords: ["05/20 08:58-18:02", "05/21 09:04-18:01", "05/22 08:59-進行中"],
        alerts: ["晚間課程可視需求加開"]
      },
      {
        id: "s005",
        name: "Zoe",
        displayName: "Zoe",
        role: "合作教練",
        phone: "0912-210-005",
        status: "合作中",
        startDate: "2023/11/15",
        payNote: "合作拆帳，月底依實際上課堂數對帳",
        classTypes: ["教練課", "友善方案", "運動按摩"],
        schedule: ["週一到週五 10:00-19:00"],
        clockRequired: false,
        clockRecords: [],
        alerts: ["合作教練本月堂數偏低，可安排體驗客"]
      },
      {
        id: "s006",
        name: "小曾",
        displayName: "小曾",
        role: "行政櫃台",
        phone: "0912-210-006",
        status: "在職",
        startDate: "2025/06/01",
        payNote: "行政櫃台，需每日打卡",
        classTypes: ["櫃台接待", "會員續約提醒", "票券儲值"],
        schedule: ["週一 09:00-18:00", "週三 09:00-18:00", "週五 09:00-18:00"],
        clockRequired: true,
        clockRecords: ["05/20 08:58-18:02", "05/21 09:04-18:01", "05/22 08:59-進行中"],
        alerts: ["今日有 3 位待補票會員，請協助聯繫"]
      }
    ];

    staffMembers.forEach(staff => {
      staff.level = staff.level || (staff.role === "正職教練" ? "LV1" : "");
      staff.dutyHours = Number(staff.dutyHours ?? (staff.clockRequired ? 160 : 0));
      staff.basePay = Number(staff.basePay ?? (staff.role === "正職教練" ? 36000 : staff.role.includes("櫃台") ? 28000 : staff.role === "店長" ? 48000 : 0));
      staff.classBonus = Number(staff.classBonus ?? (staff.role === "正職教練" ? 200 : staff.role === "兼職教練" ? 700 : staff.role === "合作教練" ? 900 : 0));
    });

    const salaryRules = [
      { key: "manager", label: "店長", basePay: 48000, hourlyRate: 0, classBonus: 0, revenueRate: 0, note: "月薪制，負責營運與月結" },
      { key: "fulltime-lv1", label: "正職LV1", basePay: 36000, hourlyRate: 0, classBonus: 200, revenueRate: 0, note: "底薪加堂獎" },
      { key: "fulltime-lv2", label: "正職LV2", basePay: 42000, hourlyRate: 0, classBonus: 250, revenueRate: 0, note: "進階正職級距" },
      { key: "parttime", label: "兼職", basePay: 0, hourlyRate: 0, classBonus: 700, revenueRate: 0, note: "按實際上課堂數計" },
      { key: "partner", label: "合作", basePay: 0, hourlyRate: 0, classBonus: 0, revenueRate: 55, note: "依銷課營收拆帳" },
      { key: "morning-parttime", label: "早班工讀", basePay: 0, hourlyRate: 190, classBonus: 0, revenueRate: 0, note: "時薪乘值班時數" },
      { key: "evening-parttime", label: "晚班工讀", basePay: 0, hourlyRate: 200, classBonus: 0, revenueRate: 0, note: "晚班時薪級距" }
    ];

    staffMembers.forEach(staff => {
      if (!staff.salaryRuleKey) {
        if (staff.role === "店長") staff.salaryRuleKey = "manager";
        else if (staff.role === "正職教練") staff.salaryRuleKey = staff.level === "LV2" ? "fulltime-lv2" : "fulltime-lv1";
        else if (staff.role === "兼職教練") staff.salaryRuleKey = "parttime";
        else if (staff.role === "合作教練") staff.salaryRuleKey = "partner";
        else if (staff.role.includes("櫃台")) staff.salaryRuleKey = "morning-parttime";
        else staff.salaryRuleKey = "parttime";
      }
    });

    bookings.forEach((booking, index) => {
      booking.id = booking.id || `seed-${index + 1}`;
      booking.status = booking.status || "booked";
      booking.note = booking.note || "";
      booking.checkIns = booking.checkIns || [];
      booking.checkedIn = Boolean(booking.checkedIn);
    });

    const calendar = document.querySelector("#calendar");
    const appRoot = document.querySelector("#appRoot");
    const bookingForm = document.querySelector("#bookingForm");
    const bookingType = document.querySelector("#bookingType");
    const bookingDay = document.querySelector("#bookingDay");
    const bookingHour = document.querySelector("#bookingHour");
    const bookingMinute = document.querySelector("#bookingMinute");
    const bookingTime = document.querySelector("#bookingTime");
    const peopleCount = document.querySelector("#peopleCount");
    const memberSelect = document.querySelector("#memberSelect");
    const memberSuggestions = document.querySelector("#memberSuggestions");
    const bookingGroupMembersWrap = document.querySelector("#bookingGroupMembersWrap");
    const bookingGroupMembers = document.querySelector("#bookingGroupMembers");
    const memberProfileSelect = document.querySelector("#memberProfileSelect");
    const memberProfileSuggestions = document.querySelector("#memberProfileSuggestions");
    const memberProfile = document.querySelector("#memberProfile");
    const memberMonthCalendar = document.querySelector("#memberMonthCalendar");
    const memberHistoryPanel = document.querySelector("#memberHistoryPanel");
    const memberSummaryMetrics = document.querySelector("#memberSummaryMetrics");
    const memberTestGrid = document.querySelector("#memberTestGrid");
    const toastStack = document.querySelector("#toastStack");
    const cursorCardTooltip = document.querySelector("#cursorCardTooltip");
    const memberDirectorySearch = document.querySelector("#memberDirectorySearch");
    const memberLevelFilter = document.querySelector("#memberLevelFilter");
    const memberTicketFilter = document.querySelector("#memberTicketFilter");
    const memberStatusFilter = document.querySelector("#memberStatusFilter");
    const clearMemberFilters = document.querySelector("#clearMemberFilters");
    const memberSortButtons = document.querySelector("#memberSortButtons");
    const toggleAddMember = document.querySelector("#toggleAddMember");
    const closeAddMemberBox = document.querySelector("#closeAddMemberBox");
    const openMemberRechargeTop = document.querySelector("#openMemberRechargeTop");
    const addMemberBox = document.querySelector("#addMemberBox");
    const newMemberName = document.querySelector("#newMemberName");
    const newMemberPhone = document.querySelector("#newMemberPhone");
    const newMemberGender = document.querySelector("#newMemberGender");
    const newMemberBirthday = document.querySelector("#newMemberBirthday");
    const newMemberLineId = document.querySelector("#newMemberLineId");
    const createMemberBtn = document.querySelector("#createMemberBtn");
    const memberSortMode = document.querySelector("#memberSortMode");
    const memberDetailModal = document.querySelector("#memberDetailModal");
    const closeMemberDetail = document.querySelector("#closeMemberDetail");
    const memberDetailTitle = document.querySelector("#memberDetailTitle");
    const memberDetailSubtitle = document.querySelector("#memberDetailSubtitle");
    const memberDetailProfile = document.querySelector("#memberDetailProfile");
    const memberDetailMonthCalendar = document.querySelector("#memberDetailMonthCalendar");
    const memberDetailHistoryPanel = document.querySelector("#memberDetailHistoryPanel");
    const rechargeModal = document.querySelector("#rechargeModal");
    const rechargeModalTitle = document.querySelector("#rechargeModalTitle");
    const rechargeModalSubtitle = document.querySelector("#rechargeModalSubtitle");
    const rechargeModalContent = document.querySelector("#rechargeModalContent");
    const closeRechargeModal = document.querySelector("#closeRechargeModal");
    const confirmModal = document.querySelector("#confirmModal");
    const confirmModalMessage = document.querySelector("#confirmModalMessage");
    const cancelConfirmBtn = document.querySelector("#cancelConfirmBtn");
    const acceptConfirmBtn = document.querySelector("#acceptConfirmBtn");
    const ticketPreview = document.querySelector("#ticketPreview");
    const memberGrid = document.querySelector("#memberGrid");
    const calendarDateRange = document.querySelector("#calendarDateRange");
    const calendarViewHint = document.querySelector("#calendarViewHint");
    const calendarLegend = document.querySelector("#calendarLegend");
    const todayCalendarBtn = document.querySelector("#todayCalendarBtn");
    const prevWeekBtn = document.querySelector("#prevWeekBtn");
    const nextWeekBtn = document.querySelector("#nextWeekBtn");
    const refreshCalendarBtn = document.querySelector("#refreshCalendarBtn");
    const calendarViewButtons = document.querySelectorAll("[data-calendar-view]");
    const coachName = document.querySelector("#coachName");
    const formMessage = document.querySelector("#formMessage");
    const calendarTypeFilters = document.querySelector("#calendarTypeFilters");
    const calendarCoachFilter = document.querySelector("#calendarCoachFilter");
    const repeatCard = document.querySelector("#repeatCard");
    const repeatBooking = document.querySelector("#repeatBooking");
    const weeklyFrequency = document.querySelector("#weeklyFrequency");
    const ticketCount = document.querySelector("#ticketCount");
    const secondBookingDay = document.querySelector("#secondBookingDay");
    const secondBookingTime = document.querySelector("#secondBookingTime");
    const repeatSummary = document.querySelector("#repeatSummary");
    const bookingStepSummary = document.querySelector("#bookingStepSummary");
    const bookingNextStep = document.querySelector("#bookingNextStep");
    const bookingBackStep = document.querySelector("#bookingBackStep");
    const submitBooking = document.querySelector("#submitBooking");
    const seriesList = document.querySelector("#seriesList");
    const clearSeries = document.querySelector("#clearSeries");
    const closeBookingPanel = document.querySelector("#closeBookingPanel");
    const bookingModal = document.querySelector("#bookingModal");
    const closeBookingModal = document.querySelector("#closeBookingModal");
    const bookingModalTitle = document.querySelector("#bookingModalTitle");
    const bookingModalSubtitle = document.querySelector("#bookingModalSubtitle");
    const bookingDetailGrid = document.querySelector("#bookingDetailGrid");
    const openDetailRepeatModalBtn = document.querySelector("#openDetailRepeatModalBtn");
    const detailRepeatModal = document.querySelector("#detailRepeatModal");
    const closeDetailRepeatModal = document.querySelector("#closeDetailRepeatModal");
    const groupMemberModal = document.querySelector("#groupMemberModal");
    const closeGroupMemberModal = document.querySelector("#closeGroupMemberModal");
    const cancelGroupMemberModal = document.querySelector("#cancelGroupMemberModal");
    const groupMemberSearch = document.querySelector("#groupMemberSearch");
    const groupMemberSuggestions = document.querySelector("#groupMemberSuggestions");
    const confirmGroupMemberBtn = document.querySelector("#confirmGroupMemberBtn");
    const bookingNote = document.querySelector("#bookingNote");
    const detailMemberWrap = document.querySelector("#detailMemberWrap");
    const detailMemberSelect = document.querySelector("#detailMemberSelect");
    const detailMemberSuggestions = document.querySelector("#detailMemberSuggestions");
    const detailCoachSelect = document.querySelector("#detailCoachSelect");
    const groupMemberProgress = document.querySelector("#groupMemberProgress");
    const groupMemberJoinWrap = document.querySelector("#groupMemberJoinWrap");
    const groupMemberJoin = document.querySelector("#groupMemberJoin");
    const addGroupMemberBtn = document.querySelector("#addGroupMemberBtn");
    const bookingCheckInBtn = document.querySelector("#bookingCheckInBtn");
    const cancelBookingBtn = document.querySelector("#cancelBookingBtn");
    const saveBookingNoteBtn = document.querySelector("#saveBookingNoteBtn");
    const detailRepeatCard = document.querySelector("#detailRepeatCard");
    const detailRepeatBooking = document.querySelector("#detailRepeatBooking");
    const detailRepeatDayButtons = document.querySelector("#detailRepeatDayButtons");
    const detailRepeatTimeList = document.querySelector("#detailRepeatTimeList");
    const detailWeeklyFrequency = document.querySelector("#detailWeeklyFrequency");
    const detailRepeatCount = document.querySelector("#detailRepeatCount");
    const detailSecondBookingDay = document.querySelector("#detailSecondBookingDay");
    const detailSecondBookingTime = document.querySelector("#detailSecondBookingTime");
    const detailRepeatSummary = document.querySelector("#detailRepeatSummary");
    const createDetailRepeatBtn = document.querySelector("#createDetailRepeatBtn");
    const staffRoleFilter = document.querySelector("#staffRoleFilter");
    const staffSelect = document.querySelector("#staffSelect");
    const staffList = document.querySelector("#staffList");
    const staffDetailModal = document.querySelector("#staffDetailModal");
    const closeStaffDetailModal = document.querySelector("#closeStaffDetailModal");
    const staffDetailTitle = document.querySelector("#staffDetailTitle");
    const staffDetailSubtitle = document.querySelector("#staffDetailSubtitle");
    const staffDetailModalBody = document.querySelector("#staffDetailModalBody");
    const staffMetricClasses = document.querySelector("#staffMetricClasses");
    const staffMetricGroupPeople = document.querySelector("#staffMetricGroupPeople");
    const staffMetricClockDays = document.querySelector("#staffMetricClockDays");
    const staffMetricAlerts = document.querySelector("#staffMetricAlerts");
    const toggleAddStaff = document.querySelector("#toggleAddStaff");
    const deleteStaffBtn = document.querySelector("#deleteStaffBtn");
    const staffAddBox = document.querySelector("#staffAddBox");
    const newStaffName = document.querySelector("#newStaffName");
    const newStaffRole = document.querySelector("#newStaffRole");
    const newStaffPhone = document.querySelector("#newStaffPhone");
    const newStaffDutyHours = document.querySelector("#newStaffDutyHours");
    const createStaffBtn = document.querySelector("#createStaffBtn");
    const operationsMetrics = document.querySelector("#operationsMetrics");
    const operationsPanel = document.querySelector("#operationsPanel");
    const courseOverview = document.querySelector("#courseOverview");
    const courseItemList = document.querySelector("#courseItemList");
    const ticketItemList = document.querySelector("#ticketItemList");
    const courseBranchCourses = document.querySelector("#courseBranchCourses");
    const courseBranchTickets = document.querySelector("#courseBranchTickets");
    const toggleAddCourseForm = document.querySelector("#toggleAddCourseForm");
    const toggleAddTicketForm = document.querySelector("#toggleAddTicketForm");
    const courseAddBlock = document.querySelector("#courseAddBlock");
    const ticketAddBlock = document.querySelector("#ticketAddBlock");
    const newCourseName = document.querySelector("#newCourseName");
    const newCourseKind = document.querySelector("#newCourseKind");
    const addCourseItem = document.querySelector("#addCourseItem");
    const newTicketName = document.querySelector("#newTicketName");
    const newTicketKind = document.querySelector("#newTicketKind");
    const newTicketCount = document.querySelector("#newTicketCount");
    const addTicketItem = document.querySelector("#addTicketItem");
    const courseItemModal = document.querySelector("#courseItemModal");
    const closeCourseItemModal = document.querySelector("#closeCourseItemModal");
    const cancelCourseItemModal = document.querySelector("#cancelCourseItemModal");
    const saveCourseItemModal = document.querySelector("#saveCourseItemModal");
    const deleteCourseItemModal = document.querySelector("#deleteCourseItemModal");
    const courseItemModalTitle = document.querySelector("#courseItemModalTitle");
    const courseItemModalSubtitle = document.querySelector("#courseItemModalSubtitle");
    const courseItemModalNote = document.querySelector("#courseItemModalNote");
    const courseItemName = document.querySelector("#courseItemName");
    const courseEditFields = document.querySelector("#courseEditFields");
    const ticketEditFields = document.querySelector("#ticketEditFields");
    const courseItemKind = document.querySelector("#courseItemKind");
    const courseItemTicketType = document.querySelector("#courseItemTicketType");
    const courseItemTimeRule = document.querySelector("#courseItemTimeRule");
    const ticketItemType = document.querySelector("#ticketItemType");
    const ticketItemCount = document.querySelector("#ticketItemCount");
    const activityLogList = document.querySelector("#activityLogList");
    const openActivityLog = document.querySelector("#openActivityLog");
    const activityLogModal = document.querySelector("#activityLogModal");
    const closeActivityLog = document.querySelector("#closeActivityLog");
    const activityLogModalList = document.querySelector("#activityLogModalList");
    let bookingMemberId = "";
    let profileMemberId = "";
    let memberPageSize = 20;
    let memberCurrentPage = 1;
    let memberDirectoryKeyword = "";
    let memberLevelFilterValue = "all";
    let memberTicketFilterValue = "all";
    let memberStatusFilterValue = "all";
    let memberCardTicketFilter = "all";
    let calendarWeekOffset = 0;
    let calendarStartOffset = 0;
    let bookingWeekOffset = 0;
    let bookingFormStep = "basic";
    let activeCourseEditor = null;
    let courseManagementBranch = "courses";
    let calendarViewMode = window.matchMedia("(max-width: 780px)").matches ? "day" : "week";
    let staffMemberId = staffMembers[0]?.id || "";
    let activeBookingId = "";
    let memberRechargeNotice = "";
    let quickBookingMemberId = "";
    let groupBookingMemberIds = [];
    let pendingGroupDetailMemberId = "";
    let ticketCountOverride = null;
    let ticketConsumePlanOverride = null;
    let dataReadyToSave = false;
    let bookingNormalizationChanged = false;

    const bookingTypeOptions = [
      { value: "coaching-1v1", label: "教練課 1v1", ticket: "course" },
      { value: "coaching-1v2", label: "教練課 1v2", ticket: "course" },
      { value: "trial-class", label: "體驗課", ticket: "trial" },
      { value: "friendly-1v1", label: "友善教練課 1v1", ticket: "course" },
      { value: "friendly-1v2", label: "友善教練課 1v2", ticket: "course" },
      { value: "small-group", label: "小班團體課", ticket: "group" },
      { value: "self-training", label: "自主訓練", ticket: "selfTraining" }
    ];

    function initOptions() {
      renderCalendarCourseFilters();
      renderCalendarCoachFilter();
      renderBookingDayOptions(0);
      renderTimePartOptions();
      setBookingTime("09:00");
      renderMemberSelect();
      renderCoachOptions();
      renderBookingTypeOptions();
      prepareBookingFormSteps();
      setBookingFormStep("basic", { skipPreview: true });
      renderProfileSelect();
      renderMemberProfile();
      renderStaffManagement();
      renderActivityLog();
      renderSecondBookingDayOptions("thu");
      renderSecondBookingTimeOptions("19:00");
    }

    function renderBookingDayOptions(weekOffset = bookingWeekOffset) {
      const current = bookingDay.value || "mon";
      bookingDay.innerHTML = days.map(day => `<option value="${day.key}">${day.label} ${shortDateLabel(day.key, weekOffset)}</option>`).join("");
      bookingDay.value = days.some(day => day.key === current) ? current : "mon";
    }

    const appStorageKey = "yugymBookingSystemDemoDataV1";
    const appStorageBackupKey = "yugymBookingSystemDemoDataV1Backup";
    const appIndexedDbName = "yugymBookingSystemDemoV1";
    const supabaseClient = !DEMO_DATA_MODE && window.supabase
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      : null;
    let cloudSaveTimer = null;

    function appDataPayload() {
      return {
        savedAt: Date.now(),
        members,
        bookings,
        courseItems,
        ticketItems,
        staffMembers,
        salaryRules
      };
    }

    function openAppDataDb() {
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          reject(new Error("IndexedDB unavailable"));
          return;
        }
        const request = indexedDB.open(appIndexedDbName, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("state");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async function writeIndexedBackup(payload) {
      try {
        const db = await openAppDataDb();
        await new Promise((resolve, reject) => {
          const transaction = db.transaction("state", "readwrite");
          transaction.objectStore("state").put(payload, "latest");
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
        });
        db.close();
      } catch (error) {
        console.warn("IndexedDB 備份失敗", error);
      }
    }

    async function readIndexedBackup() {
      try {
        const db = await openAppDataDb();
        const value = await new Promise((resolve, reject) => {
          const transaction = db.transaction("state", "readonly");
          const request = transaction.objectStore("state").get("latest");
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
        db.close();
        return value;
      } catch (error) {
        console.warn("IndexedDB 讀取失敗", error);
        return null;
      }
    }

    async function readCloudData() {
      if (!supabaseClient) return null;
      try {
        const { data, error } = await supabaseClient
          .from("app_state")
          .select("payload")
          .eq("id", SUPABASE_STATE_ID)
          .maybeSingle();
        if (error) {
          console.warn("Supabase cloud load skipped", error.message);
          return null;
        }
        return data?.payload || null;
      } catch (error) {
        console.warn("Supabase cloud load failed", error);
        return null;
      }
    }

    async function writeCloudData(payload) {
      if (!supabaseClient) return;
      try {
        const { error } = await supabaseClient
          .from("app_state")
          .upsert({
            id: SUPABASE_STATE_ID,
            payload,
            updated_at: new Date().toISOString()
          });
        if (error) console.warn("Supabase cloud save skipped", error.message);
      } catch (error) {
        console.warn("Supabase cloud save failed", error);
      }
    }

    function scheduleCloudSave(payload) {
      if (!supabaseClient) return;
      const snapshot = JSON.parse(JSON.stringify(payload));
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = setTimeout(() => writeCloudData(snapshot), 450);
    }

    function normalizeIdentity(value = "") {
      const text = String(value || "");
      if (text === "主顧客" || text === "VIP" || text.includes("老顧客")) return "主顧客";
      if (text === "新朋友" || text.includes("新客")) return "新朋友";
      if (text === "會員") return "會員";
      return "會員";
    }

    function normalizeMember(member) {
      // 舊資料或匯入資料缺少欄位時，在這裡補齊，避免畫面操作時出錯。
      member.identity = normalizeIdentity(member.identity || "新朋友");
      member.ticketWallet = member.ticketWallet || {
        course: member.tickets || 0,
        selfTraining: String(member.plan || "").includes("自主") ? 8 : 0,
        group: 0,
        massage: 0
      };
      member.bonusWallet = member.bonusWallet || { course: 0, group: 0 };
      member.ticketExpiry = member.ticketExpiry || {
        selfTraining: String(member.plan || "").includes("自主") ? member.expiresAt : "",
        group: ""
      };
      member.registeredAt = member.registeredAt || "2026/05/01";
      member.gender = member.gender || "";
      member.birthday = member.birthday || "";
      member.lineId = member.lineId || "";
      member.lastBookingAt = member.lastBookingAt || "";
      member.importNote = member.importNote || "";
      member.rechargeHistory = member.rechargeHistory || [];
      member.ticketBuckets = member.ticketBuckets || [];
      if (!member.ticketBuckets.length) {
        if (member.ticketWallet.course) {
          member.ticketBuckets.push({
            id: `${member.id}-initial-course`,
            type: "course",
            label: String(member.plan || "").includes("友善") ? "友善1" : "教練1",
            total: member.ticketWallet.course,
            remaining: member.ticketWallet.course,
            used: 0,
            isBonus: false,
            createdAt: member.registeredAt
          });
        }
        if (member.ticketWallet.selfTraining) {
          member.ticketBuckets.push({
            id: `${member.id}-initial-self`,
            type: "selfTraining",
            label: "自主",
            total: member.ticketWallet.selfTraining,
            remaining: member.ticketWallet.selfTraining,
            used: 0,
            isBonus: false,
            createdAt: member.registeredAt
          });
        }
      }
      return member;
    }

    function normalizeStaff(staff) {
      if (!staff.salaryRuleKey) {
        if (staff.role === "店長") staff.salaryRuleKey = "manager";
        else if (staff.role === "正職教練") staff.salaryRuleKey = staff.level === "LV2" ? "fulltime-lv2" : "fulltime-lv1";
        else if (staff.role === "兼職教練") staff.salaryRuleKey = "parttime";
        else if (staff.role === "合作教練") staff.salaryRuleKey = "partner";
        else if (staff.role?.includes("櫃台")) staff.salaryRuleKey = "morning-parttime";
        else staff.salaryRuleKey = "parttime";
      }
      staff.clockRecords = staff.clockRecords || [];
      staff.alerts = staff.alerts || [];
      staff.classTypes = staff.classTypes || [];
      staff.schedule = staff.schedule || [];
      return staff;
    }

    function normalizeBooking(booking, index = 0) {
      // 只有團課允許多位會員；1V2 教練課仍只保留一位「用票主會員」。
      booking.id = booking.id || `seed-${index + 1}`;
      booking.status = booking.status || "booked";
      booking.note = booking.note || "";
      booking.checkIns = booking.checkIns || [];
      booking.checkedIn = Boolean(booking.checkedIn);
      booking.weekOffset = booking.weekOffset || 0;
      if (booking.kind !== "group" && (booking.memberIds || []).length > 1) {
        const primaryMemberId = booking.memberIds[0];
        booking.memberIds = primaryMemberId ? [primaryMemberId] : [];
        booking.checkIns = (booking.checkIns || []).filter(id => id === primaryMemberId);
        if (["coaching", "friendly", "trial"].includes(booking.kind)) {
          setBookingCoach(booking, bookingCoachName(booking));
        }
        bookingNormalizationChanged = true;
      }
      return booking;
    }

    function memberCompletedCourseEvent(event, memberId) {
      if (!event || event.status === "cancelled" || event.kind === "self") return false;
      if (!["coaching", "friendly"].includes(event.kind)) return false;
      if (!(event.memberIds || []).includes(memberId)) return false;
      if ((event.checkIns || []).includes(memberId)) return true;
      return Boolean(event.checkedIn) && (event.memberIds || []).length === 1;
    }

    function memberHasCompletedCourse(memberId) {
      return bookings.some(event => memberCompletedCourseEvent(event, memberId));
    }

    function updateMemberLevelFromCompletedCourses(member) {
      if (!member || normalizeIdentity(member.identity) !== "新朋友") return false;
      if (!memberHasCompletedCourse(member.id)) return false;
      member.identity = "會員";
      return true;
    }

    function normalizeAllData() {
      members.forEach(normalizeMember);
      staffMembers.forEach(normalizeStaff);
      bookings.forEach(normalizeBooking);
      members.forEach(updateMemberLevelFromCompletedCourses);
      members.forEach(syncWalletFromBuckets);
    }

    function requestedStaffRoster() {
      return [
        { id: "s001", name: "Randy", displayName: "Randy", role: "正職教練", phone: "0912-210-001", status: "在職", startDate: "2024/03/01", payNote: "月薪制，另計團課與續約獎金", classTypes: ["教練課", "小班團課", "友善方案"], schedule: ["週一 12:00-21:00", "週四 12:00-21:00", "週五 15:00-21:00"], clockRequired: true, clockRecords: ["05/20 11:54-21:08", "05/21 12:03-21:01", "05/22 尚未退勤"], alerts: ["今日尚未完成退勤", "本週已有 2 位學員剩最後一堂，請協助續約提醒"] },
        { id: "s002", name: "Sandy", displayName: "Sandy", role: "店長", phone: "0912-210-002", status: "在職", startDate: "2024/08/12", payNote: "月薪制，負責營運、排班與月結", classTypes: ["排班管理", "會員關係", "營運檢核"], schedule: ["週一 09:00-18:00", "週二 18:00-21:00", "週六 10:00-15:00"], clockRequired: true, clockRecords: [], alerts: ["月底前需確認薪資與合作教練拆帳"] },
        { id: "s003", name: "Mango", displayName: "Mango", role: "正職教練", phone: "0912-210-003", status: "在職", startDate: "2025/01/10", payNote: "月薪制，另計堂數獎金", classTypes: ["教練課", "小班團課", "友善方案"], schedule: ["週三 13:00-18:00", "週五 09:00-14:00"], clockRequired: true, clockRecords: [], alerts: ["本週可協助承接友善方案離峰時段"] },
        { id: "s004", name: "Barry", displayName: "Barry", role: "兼職教練", phone: "0912-210-004", status: "在職", startDate: "2025/06/01", payNote: "按堂計酬，團課另計人次獎金", classTypes: ["教練課", "小班團課"], schedule: ["週一 09:00-18:00", "週三 09:00-18:00", "週五 09:00-18:00"], clockRequired: false, clockRecords: [], alerts: ["晚間課程可視需求加開"] },
        { id: "s005", name: "Zoe", displayName: "Zoe", role: "合作教練", phone: "0912-210-005", status: "合作中", startDate: "2023/11/15", payNote: "合作拆帳，月底依實際上課堂數對帳", classTypes: ["教練課", "友善方案", "運動按摩"], schedule: ["週一到週五 10:00-19:00"], clockRequired: false, clockRecords: [], alerts: ["合作教練本月堂數偏低，可安排體驗客"] },
        { id: "s006", name: "小曾", displayName: "小曾", role: "行政櫃台", phone: "0912-210-006", status: "在職", startDate: "2025/06/01", payNote: "行政櫃台，需每日打卡", classTypes: ["櫃台接待", "會員續約提醒", "票券儲值"], schedule: ["週一 09:00-18:00", "週三 09:00-18:00", "週五 09:00-18:00"], clockRequired: true, clockRecords: ["05/20 08:58-18:02", "05/21 09:04-18:01", "05/22 08:59-進行中"], alerts: ["今日有 3 位待補票會員，請協助聯繫"] }
      ];
    }

    function remapBookingCoachNames() {
      const coachMap = {
        "Coach Ken": "Randy",
        "Coach Amy": "Mango",
        "Coach Leo": "Zoe",
        "櫃台 Mia": "小曾",
        "店長 Ray": "Sandy"
      };
      let changed = false;
      bookings.forEach(booking => {
        let detail = String(booking.detail || "");
        Object.entries(coachMap).forEach(([from, to]) => {
          if (detail.includes(from)) {
            detail = detail.replaceAll(from, to);
            changed = true;
          }
        });
        booking.detail = detail;
      });
      return changed;
    }

    function ensureRequestedStaffRoster() {
      const key = "yugym-staff-roster-20260525-v1";
      let changed = false;
      if (localStorage.getItem(key) !== "true") {
        staffMembers.splice(0, staffMembers.length, ...requestedStaffRoster());
        staffMemberId = staffMembers[0]?.id || "";
        localStorage.setItem(key, "true");
        changed = true;
      }
      if (remapBookingCoachNames()) changed = true;
      staffMembers.forEach(normalizeStaff);
      return changed;
    }

    function ensureTestMemberFixtures() {
      let changed = false;
      const installmentMember = members.find(member => member.id === "m006");
      if (installmentMember) {
        installmentMember.rechargeHistory = installmentMember.rechargeHistory || [];
        installmentMember.rechargeHistory = installmentMember.rechargeHistory.filter(record =>
          record.id !== "test-m006-installment" &&
          !(record.type === "course" && record.planKey === "new1600" && record.planSessions === 30 && record.paymentLabel === "分 3 期")
        );
        const installmentRecord = {
          id: "test-m006-installment",
          date: "2026/05/20",
          type: "course",
          typeLabel: "教練課",
          planKey: "new1600",
          peoplePlan: "1v1",
          planSessions: 30,
          sessions: 10,
          unit: 1600,
          priceText: "$48,000",
          paymentLabel: "分 3 期",
          installmentText: "第 1 期"
        };
        installmentMember.rechargeHistory.unshift(installmentRecord);
        changed = true;
      }

      const renewalMember = {
        id: "m011",
        name: "續約測試",
        phone: "0912345011",
        identity: "會員",
        plan: "友善教練課 1V1",
        tickets: 0,
        expiresAt: "2026/06/30",
        status: "待續約",
        registeredAt: "2026/05/11",
        gender: "女",
        birthday: "1995/05/11",
        lineId: "renew_test",
        ticketWallet: { course: 0, selfTraining: 0, group: 0, massage: 0 },
        bonusWallet: { course: 0, group: 0 },
        ticketExpiry: { selfTraining: "", group: "" },
        rechargeHistory: [],
        ticketBuckets: [{
          id: "m011-friendly-renew",
          type: "course",
          label: "友善1V1",
          total: 2,
          remaining: 0,
          used: 2,
          isBonus: false,
          createdAt: "2026/05/11"
        }]
      };
      const existingRenewalMember = members.find(member => member.id === renewalMember.id);
      if (existingRenewalMember) {
        Object.assign(existingRenewalMember, renewalMember);
      } else {
        members.push(renewalMember);
      }
      changed = true;
      return changed;
    }

    function ensureGroupTicketTestMembers() {
      const groupTestMembers = defaultMemberSeed().filter(member => ["m012", "m013", "m014", "m015", "m016"].includes(member.id));
      let changed = false;
      groupTestMembers.forEach(testMember => {
        const existing = members.find(member => member.id === testMember.id);
        if (existing) {
          const hasGroupTicket = (existing.ticketBuckets || []).some(bucket => bucket.type === "group" && Number(bucket.remaining) > 0);
          if (!hasGroupTicket) {
            Object.assign(existing, testMember);
            changed = true;
          }
        } else {
          members.push(testMember);
          changed = true;
        }
      });
      if (changed) {
        members.forEach(normalizeMember);
        members.forEach(syncWalletFromBuckets);
      }
      return changed;
    }

    function ensureMay25TestBookings() {
      const testBookings = [
        { id: "test-20260525-0900", weekOffset: 1, day: "mon", time: "09:00", memberIds: ["m006"], kind: "coaching", title: "教練課 1v1", detail: "余大東 / Coach Amy", people: 1, general: 1, groupSlot: 0, note: "分期與簽到章測試", checkIns: ["m006"], checkedIn: true, paymentStatus: "installment" },
        { id: "test-20260525-1030", weekOffset: 1, day: "mon", time: "10:30", memberIds: ["m007"], kind: "friendly", title: "友善教練課 1v1", detail: "張小姐 / Coach Leo", people: 1, general: 1, groupSlot: 0, note: "友善時段測試" },
        { id: "test-20260525-1130", weekOffset: 1, day: "mon", time: "11:30", memberIds: ["m003"], kind: "self", title: "自主訓練", detail: "陳小姐", people: 1, general: 1, groupSlot: 0, note: "自主訓練測試" },
        { id: "test-20260525-1900", weekOffset: 1, day: "mon", time: "19:00", memberIds: ["m001", "m005", "m010"], kind: "group", title: "小班團體課", detail: "核心訓練 / Coach Ken，3/5 人", people: 3, general: 0, groupSlot: 1, note: "團課部分簽到測試", checkIns: ["m001", "m005"], checkedIn: false },
        { id: "test-20260526-0930", weekOffset: 1, day: "tue", time: "09:30", memberIds: ["m008"], kind: "trial", title: "體驗課", detail: "李先生 / Coach Ken", people: 1, general: 1, groupSlot: 0, note: "體驗課測試" },
        { id: "test-20260526-1100-renew-a", weekOffset: 1, day: "tue", time: "11:00", memberIds: ["m011"], kind: "friendly", title: "友善教練課 1v1", detail: "續約測試 / Coach Ken", people: 1, general: 1, groupSlot: 0, note: "續約前一堂測試" },
        { id: "test-20260526-1800", weekOffset: 1, day: "tue", time: "18:00", memberIds: ["m002"], kind: "coaching", title: "教練課 1v2", detail: "王小明 / Coach Amy", people: 2, general: 1, groupSlot: 0, note: "1V2 同伴課測試：只扣主會員票券" },
        { id: "test-20260526-1930", weekOffset: 1, day: "tue", time: "19:30", memberIds: ["m006"], kind: "coaching", title: "教練課 1v1", detail: "余大東 / Coach Leo", people: 1, general: 1, groupSlot: 0, note: "分期章測試", paymentStatus: "installment" },
        { id: "test-20260527-0900", weekOffset: 1, day: "wed", time: "09:00", memberIds: ["m009"], kind: "friendly", title: "友善教練課 1v2", detail: "周小姐 / Coach Ken", people: 2, general: 1, groupSlot: 0, note: "友善1V2測試" },
        { id: "test-20260527-1300", weekOffset: 1, day: "wed", time: "13:00", memberIds: ["m003"], kind: "self", title: "自主訓練", detail: "陳小姐", people: 1, general: 1, groupSlot: 0, note: "自主訓練測試" },
        { id: "test-20260527-1500", weekOffset: 1, day: "wed", time: "15:00", memberIds: ["m008"], kind: "coaching", title: "教練課 1v1", detail: "李先生 / Coach Leo", people: 1, general: 1, groupSlot: 0, note: "同時段兩組測試" },
        { id: "test-20260527-1500b", weekOffset: 1, day: "wed", time: "15:00", memberIds: ["m005"], kind: "self", title: "自主訓練", detail: "吳小姐", people: 1, general: 1, groupSlot: 0, note: "同時段兩組測試" },
        { id: "test-20260527-1930", weekOffset: 1, day: "wed", time: "19:30", memberIds: ["m005", "m009"], kind: "group", title: "小班團體課", detail: "上肢訓練 / Coach Amy，2/5 人", people: 2, general: 0, groupSlot: 1, note: "半點團課測試" },
        { id: "test-20260527-2030", weekOffset: 1, day: "wed", time: "20:30", memberIds: ["m008"], kind: "coaching", title: "教練課 1v1", detail: "李先生 / Coach Leo", people: 1, general: 1, groupSlot: 0, note: "晚間半點測試" },
        { id: "test-20260528-1000", weekOffset: 1, day: "thu", time: "10:00", memberIds: ["m004"], kind: "friendly", title: "友善教練課 1v1", detail: "黃先生 / Coach Leo", people: 1, general: 1, groupSlot: 0, note: "友善測試" },
        { id: "test-20260528-1000b", weekOffset: 1, day: "thu", time: "10:00", memberIds: ["m007"], kind: "friendly", title: "友善教練課 1v1", detail: "張小姐 / Coach Amy", people: 1, general: 1, groupSlot: 0, note: "友善測試" },
        { id: "test-20260528-1000c", weekOffset: 1, day: "thu", time: "10:00", memberIds: ["m003"], kind: "self", title: "自主訓練", detail: "陳小姐", people: 1, general: 1, groupSlot: 0, note: "同時段三組測試" },
        { id: "test-20260528-1230", weekOffset: 1, day: "thu", time: "12:30", memberIds: ["m010"], kind: "trial", title: "體驗課", detail: "林先生 / Coach Ken", people: 1, general: 1, groupSlot: 0, note: "午間體驗課測試" },
        { id: "test-20260528-1400-renew-b", weekOffset: 1, day: "thu", time: "14:00", memberIds: ["m011"], kind: "friendly", title: "友善教練課 1v1", detail: "續約測試 / Coach Ken", people: 1, general: 1, groupSlot: 0, note: "續約章測試" },
        { id: "test-20260528-1830", weekOffset: 1, day: "thu", time: "18:30", memberIds: ["m006"], kind: "coaching", title: "教練課 1v1", detail: "余大東 / Coach Ken", people: 1, general: 1, groupSlot: 0, note: "半點教練課測試" },
        { id: "test-20260529-0900", weekOffset: 1, day: "fri", time: "09:00", memberIds: ["m010"], kind: "trial", title: "體驗課", detail: "林先生 / Coach Amy", people: 1, general: 1, groupSlot: 0, note: "上午體驗測試" },
        { id: "test-20260529-1100", weekOffset: 1, day: "fri", time: "11:00", memberIds: ["m004"], kind: "friendly", title: "友善教練課 1v1", detail: "黃先生 / Coach Leo", people: 1, general: 1, groupSlot: 0, note: "友善時段測試" },
        { id: "test-20260529-1800", weekOffset: 1, day: "fri", time: "18:00", memberIds: ["m002"], kind: "coaching", title: "教練課 1v1", detail: "王小明 / Coach Amy", people: 1, general: 1, groupSlot: 0, note: "下班後教練課測試" },
        { id: "test-20260529-1800b", weekOffset: 1, day: "fri", time: "18:00", memberIds: ["m003"], kind: "self", title: "自主訓練", detail: "陳小姐", people: 1, general: 1, groupSlot: 0, note: "同時段兩組測試" },
        { id: "test-20260529-2000", weekOffset: 1, day: "fri", time: "20:00", memberIds: ["m001", "m002", "m005", "m010"], kind: "group", title: "小班團體課", detail: "臀腿訓練 / Coach Ken，4/5 人", people: 4, general: 0, groupSlot: 1, note: "週五晚間團課測試" },
        { id: "test-20260530-1100", weekOffset: 1, day: "sat", time: "11:00", memberIds: ["m008"], kind: "coaching", title: "教練課 1v1", detail: "李先生 / Coach Amy", people: 1, general: 1, groupSlot: 0, note: "週末教練課測試" },
        { id: "test-20260530-1400", weekOffset: 1, day: "sat", time: "14:00", memberIds: ["m001", "m006"], kind: "group", title: "小班團體課", detail: "週末核心 / Coach Ken，2/5 人", people: 2, general: 0, groupSlot: 1, note: "週末團課測試" },
        { id: "test-20260531-1400", weekOffset: 1, day: "sun", time: "14:00", memberIds: ["m009"], kind: "self", title: "自主訓練", detail: "周小姐", people: 1, general: 1, groupSlot: 0, note: "週日自主測試" },
        { id: "test-20260531-1500", weekOffset: 1, day: "sun", time: "15:00", memberIds: ["m006"], kind: "coaching", title: "教練課 1v1", detail: "余大東 / Coach Leo", people: 1, general: 1, groupSlot: 0, note: "週日教練課測試" }
      ];
      let changed = ensureTestMemberFixtures();
      if (ensureGroupTicketTestMembers()) changed = true;
      const activeTestIds = new Set(testBookings.map(booking => booking.id));
      for (let index = bookings.length - 1; index >= 0; index -= 1) {
        const booking = bookings[index];
        const isDemoTestBooking = /^test-202605(2[5-9]|3[0-1])/.test(booking.id || "");
        const isAccidentalDemoOverbooking =
          (booking.id || "").startsWith("booking-") &&
          booking.weekOffset === 1 &&
          booking.day === "thu" &&
          booking.time === "10:00" &&
          booking.kind === "friendly" &&
          (booking.memberIds || []).includes("m004") &&
          String(booking.detail || "").includes("Coach Ken");
        if ((isDemoTestBooking && !activeTestIds.has(booking.id)) || isAccidentalDemoOverbooking) {
          bookings.splice(index, 1);
          changed = true;
        }
      }
      testBookings.forEach(testBooking => {
        const existing = bookings.find(booking => booking.id === testBooking.id);
        if (existing) {
          Object.assign(existing, testBooking);
        } else {
          bookings.push(testBooking);
        }
        changed = true;
      });
      bookings.forEach(normalizeBooking);
      if (remapBookingCoachNames()) changed = true;
      members.forEach(normalizeMember);
      members.forEach(syncWalletFromBuckets);
      return changed;
    }

    function ensureImportedMemberList() {
      const importedMembers = Array.isArray(window.yugymImportedMembers) ? window.yugymImportedMembers : [];
      if (!importedMembers.length) return false;
      const migrationKey = `yugym-member-list-xlsx-imported-${importedMembers.length}`;
      if (localStorage.getItem(migrationKey) === "true") return false;

      const byPhone = new Map();
      members.forEach(member => {
        const phoneKey = normalizePhoneNumber(member.phone);
        if (phoneKey) byPhone.set(phoneKey, member);
      });

      let changed = false;
      importedMembers.forEach(rawMember => {
        const incoming = normalizeMember({ ...rawMember });
        const phoneKey = normalizePhoneNumber(incoming.phone);
        const existing = phoneKey ? byPhone.get(phoneKey) : null;
        if (existing) {
          ["gender", "birthday", "lineId", "lastBookingAt", "importNote"].forEach(field => {
            if (!existing[field] && incoming[field]) {
              existing[field] = incoming[field];
              changed = true;
            }
          });
          if ((!existing.registeredAt || existing.registeredAt === "2026/05/01") && incoming.registeredAt) {
            existing.registeredAt = incoming.registeredAt;
            changed = true;
          }
          (incoming.ticketBuckets || []).forEach(bucket => {
            const alreadyHasBucket = (existing.ticketBuckets || []).some(item => item.id === bucket.id);
            if (!alreadyHasBucket && (bucket.remaining || 0) > 0) {
              existing.ticketBuckets = existing.ticketBuckets || [];
              existing.ticketBuckets.push(bucket);
              changed = true;
            }
          });
          syncWalletFromBuckets(existing);
          return;
        }
        members.push(incoming);
        if (phoneKey) byPhone.set(phoneKey, incoming);
        changed = true;
      });

      if (changed) normalizeAllData();
      localStorage.setItem(migrationKey, "true");
      return changed;
    }

    function ensureSplitMay28FriendlyTestBooking() {
      const original = bookings.find(booking => booking.id === "test-20260528-1000");
      if (!original) return false;
      let changed = false;
      if ((original.memberIds || []).length > 1 || original.title.includes("1v2") || original.people > 1) {
        original.memberIds = [original.memberIds?.[0] || "m004"];
        original.title = "友善教練課 1v1";
        original.detail = "黃先生 / Coach Leo";
        original.people = 1;
        original.general = 1;
        original.groupSlot = 0;
        original.note = original.note || "友善測試";
        changed = true;
      }
      const secondBooking = bookings.find(booking => booking.id === "test-20260528-1000b");
      if (secondBooking && bookingCoachName(secondBooking) === "Coach Leo") {
        secondBooking.detail = `${bookingMemberNames(secondBooking)} / Coach Amy`;
        changed = true;
      }
      const secondExists = Boolean(secondBooking);
      if (!secondExists) {
        bookings.push({
          id: "test-20260528-1000b",
          weekOffset: 1,
          day: "thu",
          time: "10:00",
          memberIds: ["m007"],
          kind: "friendly",
          title: "友善教練課 1v1",
          detail: "張小姐 / Coach Leo",
          people: 1,
          general: 1,
          groupSlot: 0,
          note: "友善測試"
        });
        changed = true;
      }
      const ensuredSecondBooking = bookings.find(booking => booking.id === "test-20260528-1000b");
      if (ensuredSecondBooking && bookingCoachName(ensuredSecondBooking) === "Coach Leo") {
        ensuredSecondBooking.detail = `${bookingMemberNames(ensuredSecondBooking)} / Coach Amy`;
        changed = true;
      }
      if (changed) bookings.forEach(normalizeBooking);
      return changed;
    }

    function saveAppData() {
      if (!dataReadyToSave) return;
      const payload = appDataPayload();
      writeIndexedBackup(payload);
      scheduleCloudSave(payload);
      try {
        const payloadText = JSON.stringify(payload);
        localStorage.setItem(appStorageKey, payloadText);
        localStorage.setItem(appStorageBackupKey, payloadText);
      } catch (error) {
        console.warn("資料儲存失敗", error);
      }
    }

    async function loadAppData() {
      try {
        const primary = JSON.parse(localStorage.getItem(appStorageKey) || "null");
        const backup = JSON.parse(localStorage.getItem(appStorageBackupKey) || "null");
        const indexedBackup = await readIndexedBackup();
        const cloudBackup = await readCloudData();
        const saved = [cloudBackup, primary, backup, indexedBackup]
          .filter(Boolean)
          .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
        if (!saved) return;
        if (Array.isArray(saved.members)) members.splice(0, members.length, ...saved.members);
        if (Array.isArray(saved.bookings)) bookings.splice(0, bookings.length, ...saved.bookings);
        if (Array.isArray(saved.courseItems)) courseItems.splice(0, courseItems.length, ...saved.courseItems);
        if (Array.isArray(saved.ticketItems)) ticketItems.splice(0, ticketItems.length, ...saved.ticketItems);
        if (Array.isArray(saved.staffMembers)) staffMembers.splice(0, staffMembers.length, ...saved.staffMembers);
        if (Array.isArray(saved.salaryRules)) salaryRules.splice(0, salaryRules.length, ...saved.salaryRules);
        normalizeAllData();
        staffMemberId = staffMembers[0]?.id || "";
      } catch (error) {
        console.warn("資料讀取失敗", error);
      }
    }

    function availableBookingTimesFor(typeValue = bookingType.value, dayKey = bookingDay.value) {
      const plan = getPlanInfo(typeValue);
      if (plan.kind !== "friendly") return times;
      const allowed = times.filter(time => isFriendlyAvailable(dayKey, time));
      return allowed.length ? allowed : times.filter(time => isFriendlyAvailable("mon", time));
    }

    function renderTimePartOptions(preferredTime = bookingTime.value || "09:00") {
      const allowedTimes = availableBookingTimesFor();
      const preferredHour = preferredTime.split(":")[0];
      const hours = Array.from(new Set(allowedTimes.map(time => time.split(":")[0])));
      bookingHour.innerHTML = hours.map(hour => `<option value="${hour}">${hour} 時</option>`).join("");
      bookingHour.value = hours.includes(preferredHour) ? preferredHour : (hours[0] || "09");
      const minutes = allowedTimes
        .filter(time => time.startsWith(`${bookingHour.value}:`))
        .map(time => time.split(":")[1]);
      bookingMinute.innerHTML = minutes.map(minute => `<option value="${minute}">${minute} 分</option>`).join("");
      const preferredMinute = preferredTime.split(":")[1];
      bookingMinute.value = minutes.includes(preferredMinute) ? preferredMinute : (minutes[0] || "00");
      bookingTime.value = `${bookingHour.value}:${bookingMinute.value}`;
    }

    function renderSecondBookingTimeOptions(preferredTime = secondBookingTime.value || "19:00") {
      const allowedTimes = availableBookingTimesFor(bookingType.value, secondBookingDay.value);
      secondBookingTime.innerHTML = allowedTimes.map(time => `<option value="${time}">${time}</option>`).join("");
      secondBookingTime.value = allowedTimes.includes(preferredTime) ? preferredTime : (allowedTimes[0] || "09:00");
    }

    function dayIndex(dayKey) {
      return Math.max(0, days.findIndex(day => day.key === dayKey));
    }

    function secondSlotWeekBump(secondDayKey = secondBookingDay.value) {
      return dayIndex(secondDayKey) <= dayIndex(bookingDay.value) ? 1 : 0;
    }

    function secondSlotWeekOffset(secondDayKey = secondBookingDay.value, baseWeekOffset = bookingWeekOffset) {
      return baseWeekOffset + secondSlotWeekBump(secondDayKey);
    }

    function renderSecondBookingDayOptions(preferredDay = secondBookingDay.value || "thu") {
      secondBookingDay.innerHTML = days.map(day => {
        const offset = secondSlotWeekOffset(day.key);
        return `<option value="${day.key}">${day.label} ${shortDateLabel(day.key, offset)}</option>`;
      }).join("");
      secondBookingDay.value = days.some(day => day.key === preferredDay) ? preferredDay : "thu";
    }

    function setBookingTime(time) {
      const [hour, minute] = time.split(":");
      bookingHour.value = hour;
      bookingMinute.value = minute;
      bookingTime.value = `${hour}:${minute}`;
    }

    function syncBookingTimeFromParts() {
      bookingTime.value = `${bookingHour.value}:${bookingMinute.value}`;
      updatePreview();
    }

    function getPlanInfo(value) {
      if (value === "coaching-1v1") return { kind: "coaching", title: "教練課 1v1", people: 1, general: 1, groupSlot: 0 };
      if (value === "coaching-1v2") return { kind: "coaching", title: "教練課 1v2", people: 2, general: 1, groupSlot: 0 };
      if (value === "trial-class") return { kind: "trial", title: "體驗課", people: 1, general: 1, groupSlot: 0 };
      if (value === "friendly-1v1") return { kind: "friendly", title: "友善教練課 1v1", people: 1, general: 1, groupSlot: 0 };
      if (value === "friendly-1v2") return { kind: "friendly", title: "友善教練課 1v2", people: 2, general: 1, groupSlot: 0 };
      if (value === "small-group") return { kind: "group", title: "小班團體課", people: 1, general: 0, groupSlot: 1 };
      return { kind: "self", title: "自主訓練", people: 1, general: 1, groupSlot: 0 };
    }

    function usesCourseTicket(plan = getPlanInfo(bookingType.value)) {
      return !["self", "trial"].includes(plan.kind);
    }

    function bookingTicketWalletKey(plan = getPlanInfo(bookingType.value)) {
      if (plan.kind === "group") return "group";
      if (plan.kind === "self") return "selfTraining";
      return "course";
    }

    function bookingTicketLabel(plan = getPlanInfo(bookingType.value)) {
      if (plan.kind === "group") return "小班團課票券";
      if (plan.kind === "self") return "自主訓練票券";
      if (plan.kind === "trial") return "體驗課";
      return "課程票券";
    }

    function availableBookingTickets(member, plan = getPlanInfo(bookingType.value)) {
      if (!member) return 0;
      syncWalletFromBuckets(member);
      if (plan.kind === "self") return availableSelfTrainingTickets(member);
      if (bookingTicketWalletKey(plan) === "course") {
        return (member.ticketBuckets || [])
          .filter(bucket => courseBucketMatchesPlan(bucket, plan))
          .reduce((sum, bucket) => sum + Math.max(0, bucket.remaining || 0), 0);
      }
      return member.ticketWallet[bookingTicketWalletKey(plan)] || 0;
    }

    function friendlySelfTrainingUsable(dayKey = bookingDay.value, time = bookingTime.value) {
      return isFriendlyAvailable(dayKey, time);
    }

    function availableSelfTrainingTickets(member, dayKey = bookingDay.value, time = bookingTime.value) {
      if (!member) return 0;
      syncWalletFromBuckets(member);
      const regular = Math.max(0, Number(member.ticketWallet.selfTraining) || 0);
      const friendly = friendlySelfTrainingUsable(dayKey, time)
        ? Math.max(0, Number(member.ticketWallet.friendlySelfTraining) || 0)
        : 0;
      return regular + friendly;
    }

    function consumeSelfTrainingTicket(member, amount = 1, dayKey = bookingDay.value, time = bookingTime.value) {
      if (!member || availableSelfTrainingTickets(member, dayKey, time) < amount) return false;
      let remainingToUse = amount;
      if (friendlySelfTrainingUsable(dayKey, time)) {
        const friendlyUse = Math.min(member.ticketWallet.friendlySelfTraining || 0, remainingToUse);
        if (friendlyUse > 0) {
          consumeMemberTicket(member, "friendlySelfTraining", friendlyUse);
          remainingToUse -= friendlyUse;
        }
      }
      const regularUse = Math.min(member.ticketWallet.selfTraining || 0, remainingToUse);
      if (regularUse > 0) {
        consumeMemberTicket(member, "selfTraining", regularUse);
        remainingToUse -= regularUse;
      }
      syncWalletFromBuckets(member);
      return remainingToUse <= 0;
    }

    function memberCanBookType(member, typeValue = bookingType.value) {
      if (!member) return false;
      const plan = getPlanInfo(typeValue);
      if (plan.kind === "trial") return true;
      return availableBookingTickets(member, plan) > 0;
    }

    function getSelectedMember() {
      return members.find(member => member.id === bookingMemberId) || null;
    }

    function memberTicketSummary(member) {
      const tickets = [
        member.ticketWallet.course ? `課${member.ticketWallet.course}` : "",
        member.ticketWallet.group ? `團${member.ticketWallet.group}` : "",
        member.ticketWallet.selfTraining ? `自${member.ticketWallet.selfTraining}` : "",
        member.ticketWallet.friendlySelfTraining ? `友自${member.ticketWallet.friendlySelfTraining}` : "",
        member.ticketWallet.massage ? `按${member.ticketWallet.massage}` : ""
      ].filter(Boolean).join(" ");
      return tickets || "無票券";
    }

    function bookingMemberOptionLabel(member) {
      return member.name;
    }

    function displayPhone(phone) {
      const value = String(phone || "未填電話").trim();
      return value === "未填" ? "未填電話" : value.replaceAll("-", "");
    }

    function normalizePhoneNumber(phone) {
      return String(phone || "").replace(/\D/g, "");
    }

    function memberTicketTags(member) {
      syncWalletFromBuckets(member);
      const courseLabels = (member.ticketBuckets || [])
        .filter(bucket => bucket.type === "course" && (bucket.remaining || 0) > 0)
        .map(bucket => displayTicketLabel(bucket.label));
      const uniqueCourseLabels = [...new Set(courseLabels)];
      const tags = [
        ...uniqueCourseLabels.map(label => `<span class="ticket-tag ${coursePillClass(coursePaletteKindFromText(label, "coaching"))}">${label}</span>`),
        member.ticketWallet.group ? `<span class="ticket-tag group">團課</span>` : "",
        member.ticketWallet.selfTraining ? `<span class="ticket-tag self">自主</span>` : "",
        member.ticketWallet.friendlySelfTraining ? `<span class="ticket-tag friendly">友善自主</span>` : "",
        member.ticketWallet.massage ? `<span class="ticket-tag massage">按摩</span>` : ""
      ].filter(Boolean).join("");
      return tags || `<span class="ticket-tag self">無票券</span>`;
    }

    function filterMembers(query, predicate = () => true) {
      const keyword = query.trim().toLowerCase();
      if (!keyword) return [];
      return members
        .filter(member => predicate(member))
        .filter(member => {
          return [
            member.name,
            member.phone,
            member.identity,
            memberTicketSummary(member),
            bookingMemberOptionLabel(member)
          ].some(value => String(value || "").toLowerCase().includes(keyword));
        })
        .slice(0, 8);
    }

    function renderMemberSuggestionList(input, container, onSelect, predicate = () => true) {
      if (!input.value.trim()) {
        container.classList.add("hidden");
        container.innerHTML = "";
        return;
      }
      const matches = filterMembers(input.value, () => true);
      const results = matches.map(member => ({
        member,
        selectable: predicate(member)
      }));
      const unavailableReason = member => {
        const courseName = selectedBookingCourseLabel();
        if (courseName && container === memberSuggestions) return `沒有 ${courseName} 可用票券`;
        return "目前不可選";
      };
      container.innerHTML = results.length
        ? results.map(({ member, selectable }) => `
            <button class="suggestion-item ${selectable ? "" : "disabled"}" type="button" ${selectable ? `data-member-id="${member.id}"` : "disabled"}>
              <span class="suggestion-name">${member.name}</span>
              <span class="ticket-tags">${memberTicketTags(member)}</span>
              ${selectable ? "" : `<span class="suggestion-reason">${escapeHtml(unavailableReason(member))}</span>`}
            </button>
          `).join("")
        : `<button class="suggestion-item" type="button" disabled>找不到會員</button>`;
      container.classList.remove("hidden");
      const selectSuggestionMember = (event, button) => {
        event.preventDefault();
        event.stopPropagation();
        const member = members.find(item => item.id === button.dataset.memberId);
        if (member) onSelect(member);
        container.classList.add("hidden");
      };
      container.querySelectorAll("[data-member-id]").forEach(button => {
        button.addEventListener("mousedown", event => {
          event.preventDefault();
          event.stopPropagation();
        });
        button.addEventListener("click", event => {
          selectSuggestionMember(event, button);
        });
      });
    }

    function renderActivityLog() {
      const rowMarkup = log => `
        <span class="activity-item"><b>${log.time}</b>${log.action}｜${log.text}</span>
      `;
      const empty = `<span class="activity-item">目前沒有課程調整紀錄</span>`;
      activityLogList.innerHTML = activityLogs.length ? activityLogs.slice(0, 3).map(rowMarkup).join("") : empty;
      activityLogModalList.innerHTML = activityLogs.length ? activityLogs.map(rowMarkup).join("") : empty;
    }

    function addActivity(action, text) {
      activityLogs.unshift({ time: currentClockLabel(), action, text });
      renderActivityLog();
    }

    function openActivityDialog() {
      renderActivityLog();
      activityLogModal.classList.add("open");
      activityLogModal.setAttribute("aria-hidden", "false");
    }

    function closeActivityDialog() {
      activityLogModal.classList.remove("open");
      activityLogModal.setAttribute("aria-hidden", "true");
    }

    function closeMemberDetailModal() {
      memberDetailModal.classList.remove("open");
      memberDetailModal.setAttribute("aria-hidden", "true");
      profileMemberId = "";
      memberProfileSelect.value = "";
      memberDetailProfile.innerHTML = "";
      memberDetailMonthCalendar.innerHTML = "";
      memberDetailHistoryPanel.innerHTML = "";
      memberRechargeNotice = "";
      renderMemberProfile();
    }

    function closeRechargeModalDialog() {
      rechargeModal.classList.remove("open");
      rechargeModal.setAttribute("aria-hidden", "true");
      rechargeModalContent.innerHTML = "";
    }

    function showToast(message, type = "error", titleText = "") {
      if (!toastStack) return;
      const toast = document.createElement("div");
      toast.className = `toast ${type}`;
      toast.setAttribute("role", type === "error" ? "alert" : "status");

      const title = document.createElement("div");
      title.className = "toast-title";
      title.textContent = type === "success" ? "已完成" : "無法移動預約";

      title.textContent = titleText || (type === "success" ? "已完成" : "無法移動預約");

      const text = document.createElement("div");
      text.className = "toast-message";
      text.textContent = message;

      toast.append(title, text);
      toastStack.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add("show"));

      window.setTimeout(() => {
        toast.classList.remove("show");
        window.setTimeout(() => toast.remove(), 280);
      }, 3600);
    }

    function moveCursorCardTooltip(event) {
      if (!cursorCardTooltip || !cursorCardTooltip.classList.contains("show")) return;
      const margin = 12;
      const gap = 16;
      const rect = cursorCardTooltip.getBoundingClientRect();
      const width = rect.width || 220;
      const height = rect.height || 120;
      let left = event.clientX - width / 2;
      let top = event.clientY - height - gap;

      if (left < margin) left = margin;
      if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
      if (top < margin) top = event.clientY + gap;

      cursorCardTooltip.style.left = `${Math.max(margin, left)}px`;
      cursorCardTooltip.style.top = `${Math.max(margin, top)}px`;
    }

    function showCursorCardTooltip(eventEl, pointerEvent) {
      if (!cursorCardTooltip || eventEl.dataset.tooltipEnabled !== "true") return;
      const kind = eventEl.dataset.tooltipKind || "";
      cursorCardTooltip.className = `cursor-card-tooltip show ${kind}`;
      cursorCardTooltip.setAttribute("aria-hidden", "false");
      cursorCardTooltip.innerHTML = `
        <span class="event-course-tag">${escapeHtml(eventEl.dataset.tooltipTag || "")}</span>
        <div class="tooltip-member">${escapeHtml(eventEl.dataset.tooltipMember || "")}</div>
        <div class="tooltip-coach">${escapeHtml(eventEl.dataset.tooltipCoach || "")}</div>
      `;
      moveCursorCardTooltip(pointerEvent);
    }

    function hideCursorCardTooltip() {
      if (!cursorCardTooltip) return;
      cursorCardTooltip.classList.remove("show");
      cursorCardTooltip.setAttribute("aria-hidden", "true");
    }

    function closeConfirmModal(result = false) {
      confirmModal.classList.remove("open");
      confirmModal.setAttribute("aria-hidden", "true");
      const resolver = confirmModal._resolver;
      confirmModal._resolver = null;
      if (resolver) resolver(result);
    }

    function confirmChange(message = "確認要執行這項修改嗎？") {
      const lines = String(message).split("\n").filter(line => line.trim());
      if (lines.length > 1) {
        confirmModalMessage.innerHTML = `<span class="confirm-lines">${lines.map(line => {
          const isTotal = line.includes("【本次實收】") || line.includes("退款：") || line.includes("轉入會員儲值金：");
          return `<span class="confirm-line ${isTotal ? "total" : ""}">${escapeHtml(line)}</span>`;
        }).join("")}</span>`;
      } else {
        confirmModalMessage.textContent = message;
      }
      confirmModal.classList.add("open");
      confirmModal.setAttribute("aria-hidden", "false");
      return new Promise(resolve => {
        confirmModal._resolver = resolve;
      });
    }

    function prepareBookingFormSteps() {
      if (!bookingForm) return;
      [bookingType, coachName].forEach(input => {
        input?.closest(".field")?.classList.add("booking-step-basic");
      });
      [bookingDay, bookingTime, memberSelect, peopleCount].forEach(input => {
        input?.closest(".field")?.classList.add("booking-step-detail");
      });
      [
        bookingGroupMembersWrap,
        repeatCard,
        document.querySelector("#bookingForm .rule-box"),
        formMessage,
        submitBooking,
        clearSeries,
        seriesList,
        bookingBackStep,
        bookingStepSummary
      ].forEach(element => element?.classList.add("booking-step-detail"));
      bookingNextStep?.classList.add("booking-step-basic");
    }

    function selectedBookingCourseLabel() {
      return bookingType.options[bookingType.selectedIndex]?.textContent || "未選擇課程";
    }

    function bookingRequiresCoach() {
      return getPlanInfo(bookingType.value).kind !== "self";
    }

    function selectedBookingCoachSummary() {
      return bookingRequiresCoach()
        ? `教練：${coachName.value || "未指定"}`
        : "自主訓練不需指定教練";
    }

    function isGroupBookingSelected() {
      return getPlanInfo(bookingType.value).kind === "group";
    }

    function selectedGroupMembers() {
      return groupBookingMemberIds
        .map(id => members.find(member => member.id === id))
        .filter(Boolean);
    }

    function renderGroupBookingMembers() {
      if (!bookingGroupMembersWrap || !bookingGroupMembers) return;
      const isGroup = isGroupBookingSelected();
      bookingGroupMembersWrap.classList.toggle("hidden", !isGroup);
      if (!isGroup) {
        bookingGroupMembers.innerHTML = "";
        return;
      }
      const selected = selectedGroupMembers();
      bookingGroupMembers.innerHTML = selected.length
        ? selected.map(member => `
            <span class="group-member-chip">
              ${escapeHtml(member.name)}
              <button type="button" aria-label="移除 ${escapeHtml(member.name)}" data-remove-group-booking-member="${member.id}">×</button>
            </span>
          `).join("")
        : `<span class="group-member-empty">尚未加入學員</span>`;
      bookingGroupMembers.querySelectorAll("[data-remove-group-booking-member]").forEach(button => {
        button.addEventListener("click", () => {
          groupBookingMemberIds = groupBookingMemberIds.filter(id => id !== button.dataset.removeGroupBookingMember);
          renderGroupBookingMembers();
          updatePeopleByType();
        });
      });
    }

    function addGroupBookingMember(member) {
      if (!member || !isGroupBookingSelected()) return;
      if (groupBookingMemberIds.includes(member.id)) {
        showToast(`${member.name} 已經在這堂團課名單裡。`, "error", "已加入");
        return;
      }
      if (groupBookingMemberIds.length >= 5) {
        showToast("小班團課最多 5 人。", "error", "人數已滿");
        return;
      }
      if (!memberCanBookType(member, "small-group")) {
        showToast(`${member.name} 沒有可用團課票券。`, "error", "票券不足");
        return;
      }
      groupBookingMemberIds.push(member.id);
      memberSelect.value = "";
      memberSuggestions.classList.add("hidden");
      renderGroupBookingMembers();
      updatePeopleByType();
    }

    function syncCoachFieldState() {
      const coachField = coachName?.closest(".field");
      const needsCoach = bookingRequiresCoach();
      if (!needsCoach) {
        coachName.value = [...coachName.options].some(option => option.value === "不指定")
          ? "不指定"
          : (coachName.options[0]?.value || "");
      }
      coachName.disabled = !needsCoach;
      coachField?.classList.toggle("field-muted", !needsCoach);
    }

    function setBookingFormStep(step = "basic", options = {}) {
      bookingFormStep = step === "detail" ? "detail" : "basic";
      bookingForm?.classList.toggle("booking-step-basic-active", bookingFormStep === "basic");
      bookingForm?.classList.toggle("booking-step-detail-active", bookingFormStep === "detail");

      const panelTitle = document.querySelector(".panel h2");
      if (panelTitle) panelTitle.textContent = bookingFormStep === "basic" ? "新增預約" : "預約條件";

      if (bookingStepSummary) {
        bookingStepSummary.innerHTML = `
          <strong>${escapeHtml(selectedBookingCourseLabel())}</strong>
          <span>${escapeHtml(selectedBookingCoachSummary())}</span>
        `;
      }

      if (!options.skipPreview) updatePreview();
    }

    function goBookingDetailStep() {
      if (!bookingType.value || (bookingRequiresCoach() && !coachName.value)) {
        showToast("請先選擇課程與教練。", "error", "資料未完整");
        return;
      }
      setBookingFormStep("detail");
      memberSelect?.focus();
    }

    function resetBookingForm(dayKey, time, weekOffset = 0) {
      bookingMemberId = "";
      groupBookingMemberIds = [];
      memberSelect.value = "";
      repeatBooking.checked = false;
      if (repeatCard) repeatCard.style.display = "";
      weeklyFrequency.value = "1";
      ticketCountOverride = null;
      ticketConsumePlanOverride = null;
      bookingWeekOffset = weekOffset;
      renderBookingDayOptions(weekOffset);
      bookingDay.value = dayKey;
      bookingType.value = "coaching-1v1";
      renderTimePartOptions(time);
      setBookingTime(time);
      renderBookingTypeOptions();
      bookingType.value = [...bookingType.options].some(option => option.value === "coaching-1v1")
        ? "coaching-1v1"
        : (bookingType.options[0]?.value || "coaching-1v1");
      coachName.value = [...coachName.options].some(option => option.value === "不指定") ? "不指定" : (coachName.options[0]?.value || "");
      syncCoachFieldState();
      peopleCount.value = "1";
      const memberLabel = memberSelect?.closest(".field")?.querySelector("label");
      if (memberLabel) memberLabel.textContent = "會員";
      if (memberSelect) memberSelect.placeholder = "輸入姓名搜尋會員";
      renderGroupBookingMembers();
      renderSecondBookingDayOptions(secondBookingDay.value || "thu");
      renderSecondBookingTimeOptions(secondBookingTime.value || time);
      seriesList.innerHTML = "";
      formMessage.className = "message";
      formMessage.textContent = "請選擇會員與課程，系統會自動檢查容量與票券。";
      setBookingFormStep("basic", { skipPreview: true });
      if (repeatCard) repeatCard.style.display = "";
    }

    function openQuickBookingForMember(memberId) {
      const member = members.find(item => item.id === memberId);
      if (!member) return;
      quickBookingMemberId = quickBookingMemberId === member.id ? "" : member.id;
      memberDetailMonthCalendar.innerHTML = "";
    }

    function quickBookingTypeOptions(member) {
      syncWalletFromBuckets(member);
      const visibleOptions = bookingTypeOptions.filter(option => {
        if (option.ticket === "trial") return false;
        if (option.ticket === "course") {
          return (member.ticketBuckets || []).some(bucket => courseBucketMatchesPlan(bucket, getPlanInfo(option.value)));
        }
        if (option.ticket === "selfTraining") {
          return (member.ticketWallet.selfTraining || 0) + (member.ticketWallet.friendlySelfTraining || 0) > 0;
        }
        return (member.ticketWallet[option.ticket] || 0) > 0;
      });
      return visibleOptions;
    }

    function courseBucketMatchesPlan(bucket, plan, requireRemaining = true) {
      if (!bucket || bucket.type !== "course") return false;
      if (requireRemaining && (bucket.remaining || 0) <= 0) return false;
      const label = String(bucket.label || "");
      const planKey = String(bucket.planKey || "");
      const peoplePlan = String(bucket.peoplePlan || "");
      const isFriendly = label.includes("友善") || planKey.includes("friendly");
      const isPair = label.includes("2") || peoplePlan === "1v2" || ["oldRenew1800", "renew1830", "friendly1600", "new1900"].includes(planKey);
      if (plan.kind === "friendly") return isFriendly && (plan.people === 2 ? isPair : !isPair);
      if (plan.kind === "coaching") return !isFriendly && (plan.people === 2 ? isPair : !isPair);
      return false;
    }

    function quickBookingTicketCount(member, typeValue) {
      const plan = getPlanInfo(typeValue);
      if (plan.kind === "trial") return 1;
      if (bookingTicketWalletKey(plan) !== "course") return Math.max(0, availableBookingTickets(member, plan));
      return (member.ticketBuckets || [])
        .filter(bucket => courseBucketMatchesPlan(bucket, plan))
        .reduce((sum, bucket) => sum + (bucket.remaining || 0), 0);
    }

    function submitQuickBooking(memberId) {
      const member = members.find(item => item.id === memberId);
      if (!member) return;
      const selectedType = document.querySelector("#quickBookingType")?.value || "";
      if (!selectedType) {
        memberRechargeNotice = `<p><strong>無法預約：</strong>這位會員目前沒有可用票券。</p>`;
        renderMemberProfile();
        return;
      }
      bookingMemberId = member.id;
      memberSelect.value = bookingMemberOptionLabel(member);
      renderBookingTypeOptions();
      bookingType.value = selectedType;
      const [quickDay, quickWeekOffset = "0"] = (document.querySelector("#quickBookingDay")?.value || `${bookingDay.value}|0`).split("|");
      const [quickSecondDay, quickSecondWeekOffset = "0"] = (document.querySelector("#quickSecondBookingDay")?.value || `${secondBookingDay.value}|0`).split("|");
      bookingDay.value = quickDay;
      bookingWeekOffset = Number(quickWeekOffset) || 0;
      setBookingTime(document.querySelector("#quickBookingTime")?.value || "09:00");
      coachName.value = document.querySelector("#quickBookingCoach")?.value || coachName.value;
      repeatBooking.checked = Boolean(document.querySelector("#quickRepeatBooking")?.checked);
      weeklyFrequency.value = document.querySelector("#quickWeeklyFrequency")?.value || "1";
      secondBookingDay.value = quickSecondDay || secondBookingDay.value;
      secondBookingTime.value = document.querySelector("#quickSecondBookingTime")?.value || secondBookingTime.value;
      ticketCountOverride = quickBookingTicketCount(member, selectedType);
      ticketConsumePlanOverride = getPlanInfo(selectedType);
      updatePeopleByType();
      updatePreview();
      const validation = validateSeries();
      if (!validation.ok) {
        ticketCountOverride = null;
        ticketConsumePlanOverride = null;
        memberRechargeNotice = `<p><strong>快速預約失敗：</strong>${validation.message}</p>`;
        renderMemberProfile();
        return;
      }
      setBookingFormStep("detail", { skipPreview: true });
      bookingForm.requestSubmit();
      ticketCountOverride = null;
      ticketConsumePlanOverride = null;
      quickBookingMemberId = "";
      profileMemberId = member.id;
      memberRechargeNotice = `<p><strong>快速預約完成：</strong>${member.name} 已建立 ${bookingType.options[bookingType.selectedIndex]?.text || "預約"}。</p>`;
      renderMemberProfile();
    }

    function closeFloatingSurfaces() {
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
      appRoot.classList.remove("booking-panel-open");
      closeBookingDetail();
      closeDetailRepeatDialog();
      closeGroupMemberDialog();
      closeActivityDialog();
      closeRechargeModalDialog();
      if (courseItemModal.classList.contains("open")) closeCourseItemEditor();
      if (memberDetailModal.classList.contains("open")) closeMemberDetailModal();
      closeStaffDetailDialog();
      if (confirmModal.classList.contains("open")) closeConfirmModal(false);
      addMemberBox.classList.remove("active");
      staffAddBox.classList.remove("active");
      memberSuggestions.classList.add("hidden");
      memberProfileSuggestions.classList.add("hidden");
      detailMemberSuggestions.classList.add("hidden");
      if (bookingMemberId || memberSelect.value) {
        bookingMemberId = "";
        memberSelect.value = "";
        groupBookingMemberIds = [];
        renderGroupBookingMembers();
        renderBookingTypeOptions();
        renderCalendar();
        updatePreview();
      }
      setBookingFormStep("basic", { skipPreview: true });
    }

    function resolveBookingMemberId(value = memberSelect.value) {
      const normalized = value.trim();
      const matched = members.find(member =>
        member.id === normalized ||
        member.name === normalized ||
        bookingMemberOptionLabel(member) === normalized
      );
      return matched?.id || "";
    }

    function syncBookingMemberFromInput() {
      if (isGroupBookingSelected()) {
        bookingMemberId = "";
        renderBookingTypeOptions();
        updatePeopleByType();
        renderCalendar();
        return;
      }
      bookingMemberId = resolveBookingMemberId();
      const member = getSelectedMember();
      if (member && !memberCanBookType(member)) bookingMemberId = "";
      renderBookingTypeOptions();
      updatePeopleByType();
      renderCalendar();
    }

    function selectBookingMember(member) {
      if (isGroupBookingSelected()) {
        addGroupBookingMember(member);
        return;
      }
      if (!memberCanBookType(member)) return;
      bookingMemberId = member.id;
      memberSelect.value = bookingMemberOptionLabel(member);
      renderBookingTypeOptions();
      updatePeopleByType();
      renderCalendar();
    }

    function selectProfileMember(member) {
      profileMemberId = member.id;
      memberProfileSelect.value = bookingMemberOptionLabel(member);
      memberRechargeNotice = "";
      renderMemberProfile();
    }

    function selectDetailMember(member) {
      detailMemberSelect.value = bookingMemberOptionLabel(member);
    }

    function syncProfileMemberFromInput() {
      const matchedId = resolveBookingMemberId(memberProfileSelect.value);
      if (matchedId) {
        profileMemberId = matchedId;
        renderMemberProfile();
      }
    }

    function getProfileMember() {
      return members.find(member => member.id === profileMemberId) || null;
    }

    function getFilteredStaff() {
      const role = staffRoleFilter?.value || "all";
      return role === "all" ? staffMembers : staffMembers.filter(staff => staff.role === role);
    }

    function getSelectedStaff() {
      return staffMembers.find(staff => staff.id === staffMemberId) || getFilteredStaff()[0] || staffMembers[0];
    }

    function getStaffClassEvents(staff) {
      if (!staff) return [];
      return bookings.filter(booking => {
        if (booking.status === "cancelled") return false;
        const detail = booking.detail || "";
        return detail.includes(staff.displayName) || detail.includes(staff.name);
      });
    }

    function getStaffStats(staff) {
      const classEvents = getStaffClassEvents(staff);
      const classCount = classEvents.filter(event => event.kind !== "self").length;
      const groupPeople = classEvents
        .filter(event => event.kind === "group")
        .reduce((sum, event) => sum + (event.memberIds?.length || event.people || 0), 0);
      return {
        classEvents,
        classCount,
        groupPeople,
        clockDays: staff?.clockRequired ? staff.clockRecords.length : 0,
        alertCount: staff?.alerts?.length || 0
      };
    }

    function renderStaffSelect() {
      const staff = getFilteredStaff();
      if (!staff.some(item => item.id === staffMemberId)) staffMemberId = staff[0]?.id || staffMembers[0]?.id || "";
      staffSelect.innerHTML = staff.map(item => `<option value="${item.id}">${item.displayName}｜${item.role}</option>`).join("");
      staffSelect.value = staffMemberId;
    }

    function renderStaffList() {
      const staff = getFilteredStaff();
      const rows = staff.map(item => {
        const stats = getStaffStats(item);
        return `
          <tr class="${item.id === staffMemberId ? "selected" : ""}" data-staff-id="${item.id}">
            <td><strong>${item.displayName}</strong><span>${item.phone || "未填電話"}</span></td>
            <td>${item.role}${item.level ? item.level : ""}</td>
            <td>${stats.classCount} 堂</td>
            <td>${item.dutyHours || 0} 小時</td>
            <td><button class="admin-action-btn" type="button">查看</button></td>
          </tr>
        `;
      }).join("") || `<tr><td colspan="5">沒有符合的人員，請調整類型篩選。</td></tr>`;
      staffList.innerHTML = `
        <div class="member-table-wrap admin-table-wrap">
          <table class="member-table admin-table">
            <thead>
              <tr>
                <th>姓名 / 電話</th>
                <th>職務</th>
                <th>本月堂數</th>
                <th>值班時數</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      staffList.querySelectorAll("[data-staff-id]").forEach(button => {
        button.addEventListener("click", async () => {
          staffMemberId = button.dataset.staffId;
          renderStaffManagement();
          openStaffDetailModal();
        });
      });
    }

    function getSalaryRule(staff) {
      return salaryRules.find(rule => rule.key === staff?.salaryRuleKey) || salaryRules[0];
    }

    function staffSalesAmount(staff, records = rechargeScope("month")) {
      if (!staff) return 0;
      return records
        .filter(record => record.collector === staff.displayName || record.collector === staff.name)
        .reduce((sum, record) => sum + recordAmount(record), 0);
    }

    function staffRevenueAmount(staff, bookingsScope = operationBookingScope("month")) {
      if (!staff) return 0;
      return bookingsScope
        .filter(event => bookingCoachName(event) === staff.displayName || bookingCoachName(event) === staff.name)
        .reduce((sum, event) => sum + bookingSalesValue(event), 0);
    }

    function staffCompensation(staff, bookingsScope = operationBookingScope("month")) {
      const stats = getStaffStats(staff);
      const rule = getSalaryRule(staff);
      const revenue = staffRevenueAmount(staff, bookingsScope);
      const basePay = Number(rule.basePay || 0);
      const hourlyPay = Number(rule.hourlyRate || 0) * Number(staff?.dutyHours || 0);
      const classBonusTotal = Number(rule.classBonus || 0) * stats.classCount;
      const revenueShare = Math.round(revenue * (Number(rule.revenueRate || 0) / 100));
      const total = basePay + hourlyPay + classBonusTotal + revenueShare;
      return { rule, basePay, hourlyPay, classBonusTotal, revenueShare, total };
    }

    function renderStaffMetrics() {
      const staff = getSelectedStaff();
      if (!staff) {
        staffMetricClasses.textContent = "0";
        staffMetricGroupPeople.textContent = "0";
        staffMetricClockDays.textContent = "-";
        staffMetricAlerts.textContent = "0";
        return;
      }
      const stats = getStaffStats(staff);
      staffMetricClasses.textContent = stats.classCount;
      staffMetricGroupPeople.textContent = stats.groupPeople;
      staffMetricClockDays.textContent = staff.dutyHours || (staff.clockRequired ? stats.clockDays : "-");
      staffMetricAlerts.textContent = stats.alertCount;
    }

    function staffDetailMarkup(staff) {
      const stats = getStaffStats(staff);
      const pay = staffCompensation(staff);
      const classRows = stats.classEvents.length
        ? stats.classEvents.map(event => {
            const day = days.find(item => item.key === event.day);
            const count = event.kind === "group" ? `${event.memberIds?.length || event.people || 0}/5 人` : `${event.people} 人`;
            return `<li>${day?.label || event.day} ${event.time}｜${event.title}｜${count}</li>`;
          }).join("")
        : `<li>本月尚未安排課程。</li>`;

      const clockRows = staff.clockRequired
        ? staff.clockRecords.map(record => `<li>${record}</li>`).join("")
        : `<li>${staff.role}目前不需每日打卡。</li>`;

      return `
        <div class="staff-detail-top">
          <div>
            <h3>${staff.displayName}</h3>
            <p>${staff.phone}｜到職 / 合作日 ${staff.startDate}</p>
          </div>
          <span class="role-badge">${staff.role}</span>
        </div>

        <div class="member-edit-grid">
          <label>姓名<input id="staffEditName" value="${staff.displayName.replace("Coach ", "")}"></label>
          <label>電話<input id="staffEditPhone" value="${staff.phone || ""}"></label>
          <label>職務
            <select id="staffEditRole">
              ${["店長", "正職教練", "兼職教練", "合作教練", "行政櫃台", "早班工讀", "晚班工讀"].map(role => `<option value="${role}" ${role === staff.role ? "selected" : ""}>${role}</option>`).join("")}
            </select>
          </label>
          <label>狀態<input id="staffEditStatus" value="${staff.status || "在職"}"></label>
          <label>到職 / 合作日<input id="staffEditStartDate" value="${staff.startDate || ""}"></label>
          <label>值班時數<input id="staffEditDutyHours" type="number" min="0" step="0.5" value="${staff.dutyHours || 0}"></label>
          <label>可排課時段<input id="staffEditSchedule" value="${(staff.schedule || []).join("、")}"></label>
          <label>營運提醒<input id="staffEditAlerts" value="${(staff.alerts || []).join("、")}"></label>
          <button class="primary-btn" type="button" id="saveStaffInfoBtn">儲存人員資料</button>
        </div>

        <div class="staff-info-grid">
          <div class="staff-info-item">
            <span>狀態</span>
            <strong>${staff.status}</strong>
          </div>
          <div class="staff-info-item">
            <span>薪資 / 分潤備註</span>
            <strong>${staff.payNote}｜估算 ${money(pay.total)}</strong>
          </div>
        </div>

        <div class="staff-panel-grid">
          <div class="staff-mini-panel">
            <span>可上課 / 工作內容</span>
            <strong>${staff.classTypes.join("、")}</strong>
          </div>
          <div class="staff-mini-panel">
            <span>打卡規則</span>
            <strong>${staff.clockRequired ? "需要打卡" : "不需每日打卡"}｜值班 ${staff.dutyHours || 0} 小時</strong>
          </div>
        </div>

        <div>
          <div class="staff-section-title">可排課時段</div>
          <ul class="staff-chip-list">
            ${staff.schedule.map(item => `<li>${item}</li>`).join("")}
          </ul>
        </div>

        <div>
          <div class="staff-section-title">本月上課紀錄</div>
          <ul class="staff-log-list">${classRows}</ul>
        </div>

        <div>
          <div class="staff-section-title">打卡紀錄</div>
          <ul class="staff-log-list">${clockRows}</ul>
        </div>

        <div>
          <div class="staff-section-title">營運提醒</div>
          <ul class="staff-alert-list">
            ${staff.alerts.map(item => `<li>${item}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    function bindStaffDetailEditor(container, staff) {
      container.querySelector("#saveStaffInfoBtn")?.addEventListener("click", async () => {
        if (!(await confirmChange(`確認要儲存 ${staff.displayName || staff.name} 的資料修改嗎？`))) return;
        const name = container.querySelector("#staffEditName")?.value.trim() || staff.name;
        staff.name = name.replace(/^Coach\s+/i, "");
        staff.phone = container.querySelector("#staffEditPhone")?.value.trim() || "未填";
        staff.role = container.querySelector("#staffEditRole")?.value || staff.role;
        staff.displayName = staff.name;
        staff.status = container.querySelector("#staffEditStatus")?.value.trim() || "在職";
        staff.startDate = container.querySelector("#staffEditStartDate")?.value.trim() || staff.startDate;
        staff.dutyHours = Number(container.querySelector("#staffEditDutyHours")?.value) || 0;
        staff.schedule = (container.querySelector("#staffEditSchedule")?.value || "").split(/[、,，]/).map(item => item.trim()).filter(Boolean);
        staff.alerts = (container.querySelector("#staffEditAlerts")?.value || "").split(/[、,，]/).map(item => item.trim()).filter(Boolean);
        normalizeStaff(staff);
        renderCoachOptions();
        renderCalendarCoachFilter();
        saveAppData();
        renderStaffManagement();
        renderOperationsSummary();
        openStaffDetailModal();
      });
    }

    function openStaffDetailModal() {
      const staff = getSelectedStaff();
      if (!staff || !staffDetailModal || !staffDetailModalBody) return;
      staffDetailTitle.textContent = staff.displayName || "教練資料";
      staffDetailSubtitle.textContent = `${staff.phone || "未填電話"}｜${staff.role}${staff.level ? staff.level : ""}`;
      staffDetailModalBody.innerHTML = staffDetailMarkup(staff);
      bindStaffDetailEditor(staffDetailModalBody, staff);
      staffDetailModal.classList.add("show");
      staffDetailModal.setAttribute("aria-hidden", "false");
    }

    function closeStaffDetailDialog() {
      staffDetailModal?.classList.remove("show");
      staffDetailModal?.setAttribute("aria-hidden", "true");
    }

    function renderStaffManagement() {
      if (!staffSelect || !staffList) return;
      renderStaffSelect();
      renderStaffList();
      renderStaffMetrics();
    }

    function courseKindLabel(kind) {
      const labels = {
        coaching: "教練課",
        friendly: "友善教練課",
        trial: "體驗課",
        group: "團體課",
        self: "自主訓練",
        course: "教練課",
        selfTraining: "自主訓練",
        friendlySelfTraining: "友善自主",
        massage: "運動按摩",
        bonus: "贈送票券"
      };
      return labels[kind] || kind;
    }

    function defaultCourseTicketType(kind) {
      if (kind === "group") return "group";
      if (kind === "self") return "selfTraining";
      return "course";
    }

    function courseTimeRuleLabel(rule) {
      const labels = {
        all: "全部營業時段",
        weekdayOffPeak: "平日離峰 09:00-18:00",
        businessHours: "一般營業時段"
      };
      return labels[rule] || labels.all;
    }

    function normalizeCourseItem(item) {
      item.ticketType = item.ticketType || defaultCourseTicketType(item.kind);
      item.timeRule = item.timeRule || (String(item.name || "").includes("友善") ? "weekdayOffPeak" : "all");
      return item;
    }

    const calendarCoursePalette = {
      coaching: { label: "教練課", swatch: "blue" },
      trial: { label: "體驗課", swatch: "amber" },
      friendly: { label: "友善教練課", swatch: "violet" },
      group: { label: "小班團課", swatch: "orange" },
      self: { label: "自主訓練", swatch: "gray" },
      massage: { label: "運動按摩", swatch: "green" },
      bonus: { label: "贈送票券", swatch: "green" }
    };

    function coursePaletteKindFromText(value = "", fallback = "coaching") {
      const source = String(value || "").toLowerCase();
      if (source.includes("friendly") || source.includes("友善")) return "friendly";
      if (source.includes("trial") || source.includes("體驗")) return "trial";
      if (source.includes("group") || source.includes("團") || source.includes("小班")) return "group";
      if (source.includes("self") || source.includes("自主")) return "self";
      if (source.includes("massage") || source.includes("按摩")) return "massage";
      if (source.includes("bonus") || source.includes("贈送")) return "bonus";
      return fallback;
    }

    function coursePillClass(type) {
      if (type === "course") return "coaching";
      if (type === "selfTraining") return "self";
      if (type === "friendlySelfTraining") return "friendly";
      if (calendarCoursePalette[type]) return type;
      return coursePaletteKindFromText(type, "coaching");
    }

    function paletteLabel(type) {
      const kind = coursePillClass(type);
      return calendarCoursePalette[kind]?.label || courseKindLabel(type);
    }

    function ticketItemPaletteKind(item = {}) {
      if (item.isBonus) return "bonus";
      if (item.type === "group") return "group";
      if (item.type === "selfTraining") return "self";
      if (item.type === "friendlySelfTraining") return "friendly";
      if (item.type === "massage") return "massage";
      return coursePaletteKindFromText(`${item.name || ""} ${item.label || ""}`, "coaching");
    }

    function ticketBucketPaletteClass(bucket = {}) {
      if (bucket.needsRenew) return "renew";
      if (bucket.isBonus) return "bonus";
      if (bucket.type === "group") return "group";
      if (bucket.type === "selfTraining") return "self";
      if (bucket.type === "friendlySelfTraining") return "friendly";
      if (bucket.type === "massage") return "massage";
      return coursePaletteKindFromText(bucket.label || "", "coaching");
    }

    function courseItemCalendarKind(item) {
      const source = `${item?.id || ""} ${item?.name || ""} ${item?.timeRule || ""}`.toLowerCase();
      if (item?.kind === "group") return "group";
      if (item?.kind === "self") return "self";
      if (item?.kind === "trial" || source.includes("trial") || source.includes("體驗")) return "trial";
      if (source.includes("friendly") || source.includes("友善") || item?.timeRule === "weekdayOffPeak") return "friendly";
      return "coaching";
    }

    function calendarCourseFilterItems() {
      const presentTypes = new Set();
      courseItems.forEach(item => presentTypes.add(courseItemCalendarKind(normalizeCourseItem(item))));
      if (bookingTypeOptions.some(option => option.value === "trial-class")) presentTypes.add("trial");
      return ["coaching", "trial", "friendly", "group", "self"]
        .filter(type => presentTypes.has(type))
        .map(type => ({ type, ...calendarCoursePalette[type] }));
    }

    function renderCalendarCourseFilters() {
      if (!calendarTypeFilters) return;
      const filters = calendarCourseFilterItems();
      const checked = new Set([...calendarTypeFilters.querySelectorAll("input:checked")].map(input => input.value));
      const hasExistingChoice = calendarTypeFilters.querySelectorAll("input").length > 0;
      calendarTypeFilters.innerHTML = filters.map(item => {
        const isChecked = !hasExistingChoice || checked.has(item.type);
        return `
          <label class="filter-check">
            <input type="checkbox" value="${item.type}" ${isChecked ? "checked" : ""}>
            <span class="swatch ${item.swatch}"></span>${item.label}
          </label>
        `;
      }).join("");
      if (calendarLegend) {
        calendarLegend.innerHTML = filters.map(item => `
          <span class="legend-item"><span class="swatch ${item.swatch}"></span>${item.label}</span>
        `).join("");
      }
    }

    function renderCalendarCoachFilter() {
      if (!calendarCoachFilter) return;
      const selected = calendarCoachFilter.dataset.selected || calendarCoachFilter.querySelector(".active")?.dataset.coachFilter || "all";
      const coaches = teachingStaffMembers().map(staff => staff.displayName).filter(Boolean);
      calendarCoachFilter.innerHTML = [
        `<span>教練</span>`,
        `<button class="coach-filter-button ${selected === "all" ? "active" : ""}" type="button" data-coach-filter="all">全部教練</button>`,
        ...coaches.map(name => `
          <button class="coach-filter-button ${selected === name ? "active" : ""}" type="button" data-coach-filter="${escapeHtml(name)}">${escapeHtml(name)}</button>
        `)
      ].join("");
      calendarCoachFilter.dataset.selected = selected === "all" || coaches.includes(selected) ? selected : "all";
      calendarCoachFilter.querySelectorAll(".coach-filter-button").forEach(button => {
        button.classList.toggle("active", button.dataset.coachFilter === calendarCoachFilter.dataset.selected);
      });
    }

    function activeCalendarCoachName() {
      return calendarCoachFilter?.dataset.selected || "all";
    }

    function calendarCoachMatches(event, coach) {
      if (!coach || coach === "all") return true;
      return normalizeCoachName(bookingCoachName(event)) === normalizeCoachName(coach);
    }

    function requestedCourseCatalog() {
      return [
        { id: "c-coach-1v1", name: "教練課1V1", kind: "coaching", ticketType: "course", timeRule: "all" },
        { id: "c-coach-1v2", name: "教練課1V2", kind: "coaching", ticketType: "course", timeRule: "all" },
        { id: "c-friendly-1v1", name: "友善教練課1V1", kind: "coaching", ticketType: "course", timeRule: "weekdayOffPeak" },
        { id: "c-friendly-1v2", name: "友善教練課1V2", kind: "coaching", ticketType: "course", timeRule: "weekdayOffPeak" },
        { id: "c-self-training", name: "自主訓練", kind: "self", ticketType: "selfTraining", timeRule: "all" },
        { id: "c-small-strength", name: "小班肌力", kind: "group", ticketType: "group", timeRule: "all" }
      ];
    }

    function requestedTicketCatalog() {
      return [
        { id: "t-course", name: "教練課", type: "course", count: 1 },
        { id: "t-friendly", name: "友善教練課", type: "course", count: 12 },
        { id: "t-group", name: "團體課", type: "group", count: 1 },
        { id: "t-self", name: "自主訓練", type: "selfTraining", count: 2 },
        { id: "t-friendly-self", name: "友善自主", type: "friendlySelfTraining", count: 2 },
        { id: "t-bonus-course", name: "贈送教練課", type: "course", count: 1, isBonus: true }
      ];
    }

    function ensureRequestedCourseCatalog() {
      const key = "yugym-course-catalog-v20260524-specific";
      if (localStorage.getItem(key) === "true") return false;
      courseItems.splice(0, courseItems.length, ...requestedCourseCatalog().map(item => ({ ...item })));
      ticketItems.splice(0, ticketItems.length, ...requestedTicketCatalog().map(item => ({ ...item })));
      localStorage.setItem(key, "true");
      return true;
    }

    function ensureFriendlySelfTicketItem() {
      if (ticketItems.some(item => item.type === "friendlySelfTraining")) return false;
      ticketItems.push({ id: "t-friendly-self", name: "友善自主", type: "friendlySelfTraining", count: 2 });
      return true;
    }

    function openCourseItemEditor(kind, id) {
      activeCourseEditor = { kind, id };
      const isTicket = kind === "ticket";
      const item = isTicket
        ? ticketItems.find(ticket => ticket.id === id)
        : courseItems.find(course => course.id === id);
      if (!item) return;
      if (!isTicket) normalizeCourseItem(item);
      deleteCourseItemModal.classList.remove("hidden");

      courseItemModalTitle.textContent = isTicket ? "調整票券" : "調整課程";
      courseItemModalSubtitle.textContent = isTicket
        ? "修改票券名稱、類型與固定堂數。"
        : "修改課程名稱、類型、可使用票券與可預約時段。";
      courseItemName.value = item.name || "";
      courseEditFields.classList.toggle("hidden", isTicket);
      ticketEditFields.classList.toggle("hidden", !isTicket);
      courseItemModalNote.textContent = isTicket
        ? "票券類型會影響會員是否能預約對應課程；固定堂數會套用在新增或管理票券時。"
        : "適用票券會影響預約時可選會員，友善方案建議維持平日離峰時段。";

      if (isTicket) {
        ticketItemType.value = item.type || "course";
        ticketItemCount.value = Math.max(1, Number(item.count) || 1);
      } else {
        courseItemKind.value = item.kind || "coaching";
        courseItemTicketType.value = item.ticketType || defaultCourseTicketType(item.kind);
        courseItemTimeRule.value = item.timeRule || "all";
      }

      courseItemModal.classList.add("open");
      courseItemModal.setAttribute("aria-hidden", "false");
      setTimeout(() => courseItemName.focus(), 0);
    }

    function openNewCourseItemEditor(kind) {
      const isTicket = kind === "newTicket";
      activeCourseEditor = { kind };
      courseItemModalTitle.textContent = isTicket ? "新增票券" : "新增課程";
      courseItemModalSubtitle.textContent = isTicket
        ? "建立新的可販售票券，之後可用在會員儲值與預約限制。"
        : "建立新的可預約課程，並設定可使用票券與可預約時段。";
      courseItemName.value = "";
      courseEditFields.classList.toggle("hidden", isTicket);
      ticketEditFields.classList.toggle("hidden", !isTicket);
      deleteCourseItemModal.classList.add("hidden");
      courseItemModalNote.textContent = isTicket
        ? "新增後會出現在現有票券小卡中，點小卡可再調整。"
        : "新增後會出現在現有課程小卡中，點小卡可再調整。";

      if (isTicket) {
        ticketItemType.value = "course";
        ticketItemCount.value = "1";
      } else {
        courseItemKind.value = "coaching";
        courseItemTicketType.value = "course";
        courseItemTimeRule.value = "all";
      }

      courseItemModal.classList.add("open");
      courseItemModal.setAttribute("aria-hidden", "false");
      setTimeout(() => courseItemName.focus(), 0);
    }

    function closeCourseItemEditor() {
      courseItemModal.classList.remove("open");
      courseItemModal.setAttribute("aria-hidden", "true");
      deleteCourseItemModal.classList.remove("hidden");
      activeCourseEditor = null;
    }

    async function saveCourseItemEditor() {
      if (!activeCourseEditor) return;
      const isNewCourse = activeCourseEditor.kind === "newCourse";
      const isNewTicket = activeCourseEditor.kind === "newTicket";
      const isTicket = activeCourseEditor.kind === "ticket";
      const item = isTicket
        ? ticketItems.find(ticket => ticket.id === activeCourseEditor.id)
        : courseItems.find(course => course.id === activeCourseEditor.id);
      const nextName = courseItemName.value.trim();
      if (!nextName) {
        courseItemName.focus();
        return;
      }
      if (isNewCourse || isNewTicket) {
        const label = isNewTicket ? "票券" : "課程";
        if (!(await confirmChange(`確認要新增${label}「${nextName}」嗎？`))) return;
        if (isNewTicket) {
          ticketItems.push({
            id: `t${Date.now()}`,
            name: nextName,
            type: ticketItemType.value,
            count: Math.max(1, Number(ticketItemCount.value) || 1)
          });
        } else {
          courseItems.push(normalizeCourseItem({
            id: `c${Date.now()}`,
            name: nextName,
            kind: courseItemKind.value,
            ticketType: courseItemTicketType.value,
            timeRule: courseItemTimeRule.value
          }));
        }
        saveAppData();
        renderCourseManagement();
        closeCourseItemEditor();
        return;
      }
      if (!item) return;
      const confirmText = isTicket
        ? `確認要儲存票券「${item.name}」的修改嗎？`
        : `確認要儲存課程「${item.name}」的修改嗎？`;
      if (!(await confirmChange(confirmText))) return;

      item.name = nextName;
      if (isTicket) {
        item.type = ticketItemType.value;
        item.count = Math.max(1, Number(ticketItemCount.value) || item.count || 1);
      } else {
        item.kind = courseItemKind.value;
        item.ticketType = courseItemTicketType.value || defaultCourseTicketType(item.kind);
        item.timeRule = courseItemTimeRule.value || "all";
      }
      saveAppData();
      renderCourseManagement();
      closeCourseItemEditor();
    }

    async function deleteCourseItemEditor() {
      if (!activeCourseEditor) return;
      const isTicket = activeCourseEditor.kind === "ticket";
      const list = isTicket ? ticketItems : courseItems;
      const index = list.findIndex(item => item.id === activeCourseEditor.id);
      if (index < 0) return;
      const label = isTicket ? "票券" : "課程";
      if (!(await confirmChange(`確認要刪除${label}「${list[index].name}」嗎？`))) return;
      list.splice(index, 1);
      saveAppData();
      renderCourseManagement();
      closeCourseItemEditor();
    }

    function setCourseManagementBranch(branch = "courses") {
      courseManagementBranch = branch === "tickets" ? "tickets" : "courses";
      const coursesVisible = !document.querySelector("#coursesView")?.classList.contains("hidden");
      document.querySelectorAll("[data-course-nav-branch]").forEach(button => {
        button.classList.toggle("active", coursesVisible && (button.dataset.courseNavRoot === "true" || button.dataset.courseNavBranch === courseManagementBranch));
      });
      courseBranchCourses?.classList.toggle("hidden", courseManagementBranch !== "courses");
      courseBranchTickets?.classList.toggle("hidden", courseManagementBranch !== "tickets");
    }

    function renderCourseManagement() {
      if (!courseItemList || !ticketItemList) return;
      courseItems.forEach(normalizeCourseItem);
      renderCalendarCourseFilters();
      if (courseOverview) {
        const courseStats = {
          total: courseItems.length,
          coaching: courseItems.filter(item => item.kind === "coaching").length,
          group: courseItems.filter(item => item.kind === "group").length,
          tickets: ticketItems.length
        };
        courseOverview.innerHTML = `
          <div class="course-overview-card"><span>可預約課程</span><strong>${courseStats.total}</strong></div>
          <div class="course-overview-card"><span>教練課類</span><strong>${courseStats.coaching}</strong></div>
          <div class="course-overview-card"><span>團體課類</span><strong>${courseStats.group}</strong></div>
          <div class="course-overview-card"><span>可販售票券</span><strong>${courseStats.tickets}</strong></div>
        `;
      }
      const courseRows = courseItems.map(item => {
        const calendarKind = courseItemCalendarKind(normalizeCourseItem(item));
        const ticketKind = coursePillClass(item.ticketType || defaultCourseTicketType(item.kind));
        return `
          <tr tabindex="0" data-open-course="${item.id}" aria-label="調整課程 ${escapeHtml(item.name)}">
            <td><strong>${escapeHtml(item.name)}</strong><span>點擊可修改課程內容</span></td>
            <td><span class="course-pill ${calendarKind}">${paletteLabel(calendarKind)}</span></td>
            <td><span class="course-pill ${ticketKind}">${courseKindLabel(item.ticketType || defaultCourseTicketType(item.kind))}</span></td>
            <td>${courseTimeRuleLabel(item.timeRule || "all")}</td>
            <td><button class="admin-action-btn" type="button">編輯</button></td>
          </tr>
      `;
      }).join("") || `<tr><td colspan="5">尚無課程，可以從左側新增。</td></tr>`;
      courseItemList.innerHTML = `
        <div class="member-table-wrap admin-table-wrap">
          <table class="member-table admin-table course-admin-table">
            <thead>
              <tr>
                <th>課程名稱</th>
                <th>行事曆顏色</th>
                <th>適用票券</th>
                <th>適用時段</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>${courseRows}</tbody>
          </table>
        </div>
      `;
      const ticketRows = ticketItems.map(item => {
        const ticketKind = ticketItemPaletteKind(item);
        return `
          <tr tabindex="0" data-open-ticket="${item.id}" aria-label="調整票券 ${escapeHtml(item.name)}">
            <td><strong>${escapeHtml(item.name)}</strong><span>點擊可修改票券內容</span></td>
            <td><span class="course-pill ${coursePillClass(item.type || "course")}">${courseKindLabel(item.type || "course")}</span></td>
            <td>${Math.max(1, Number(item.count) || 1)} 堂</td>
            <td><span class="course-pill ${ticketKind}">${paletteLabel(ticketKind)}</span></td>
            <td><button class="admin-action-btn" type="button">編輯</button></td>
          </tr>
      `;
      }).join("") || `<tr><td colspan="5">尚無票券，可以從左側新增。</td></tr>`;
      ticketItemList.innerHTML = `
        <div class="member-table-wrap admin-table-wrap">
          <table class="member-table admin-table course-admin-table">
            <thead>
              <tr>
                <th>票券名稱</th>
                <th>票券類型</th>
                <th>固定堂數</th>
                <th>顏色標籤</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>${ticketRows}</tbody>
          </table>
        </div>
      `;
      courseItemList.querySelectorAll("[data-open-course]").forEach(card => {
        card.addEventListener("click", () => openCourseItemEditor("course", card.dataset.openCourse));
        card.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openCourseItemEditor("course", card.dataset.openCourse);
          }
        });
      });
      ticketItemList.querySelectorAll("[data-open-ticket]").forEach(card => {
        card.addEventListener("click", () => openCourseItemEditor("ticket", card.dataset.openTicket));
        card.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openCourseItemEditor("ticket", card.dataset.openTicket);
          }
        });
      });
      setCourseManagementBranch(courseManagementBranch);
    }

    function recordAmount(record) {
      return parseMoneyText(record.collectedAmountText) || Number(record.amount) || parseMoneyText(record.priceText);
    }

    function recordDateInfo(record) {
      const match = String(record.date || "").match(/(\d{4})\/(\d{2})\/(\d{2})/);
      if (!match) return { day: 0, month: "" };
      return { day: Number(match[3]), month: `${match[1]}/${match[2]}` };
    }

    function allRechargeRecords() {
      return members.flatMap(member => (member.rechargeHistory || []).map(record => ({ ...record, member })));
    }

    function isClassBooking(event) {
      return event.status !== "cancelled" && event.kind !== "self";
    }

    function bookingSalesValue(event) {
      const headCount = Math.max(1, event.memberIds?.length || event.people || 1);
      if (event.kind === "group") return headCount * 500;
      if (event.kind === "trial") return 1800;
      if (event.kind === "friendly") return event.title.includes("1v2") || event.people >= 2 ? 1600 : 1300;
      if (event.kind === "coaching") return event.title.includes("1v2") || event.people >= 2 ? 1800 : 1500;
      return 0;
    }

    function operationBookingScope(scope = "month") {
      return bookings.filter(event => {
        if (!isClassBooking(event)) return false;
        if ((event.weekOffset || 0) !== 0) return false;
        if (scope === "day") return getBookingDayNumber(event) === currentCalendarDayNumber();
        return getBookingDayNumber(event) >= 1 && getBookingDayNumber(event) <= 31;
      });
    }

    function rechargeScope(scope = "month") {
      const currentMonth = "2026/05";
      const currentDay = currentCalendarDayNumber();
      return allRechargeRecords().filter(item => {
        const info = recordDateInfo(item);
        if (info.month !== currentMonth) return false;
        return scope === "day" ? info.day === currentDay : true;
      });
    }

    function contractStats(records) {
      return records.reduce((stats, record) => {
        const key = String(record.planKey || record.pricePlan || "");
        const label = String(record.typeLabel || "");
        if (key.startsWith("new") || label.includes("新客")) stats.newCount += 1;
        if (key.includes("Renew") || key.includes("renew") || label.includes("續約")) stats.renewCount += 1;
        return stats;
      }, { newCount: 0, renewCount: 0 });
    }

    function renderOperationsSummary() {
      const todayBookings = operationBookingScope("day");
      const monthBookings = operationBookingScope("month");
      const todayRecords = rechargeScope("day");
      const monthRecords = rechargeScope("month");
      const todayRevenue = todayRecords.reduce((sum, item) => sum + recordAmount(item), 0);
      const monthRevenue = monthRecords.reduce((sum, item) => sum + recordAmount(item), 0);
      const todayContracts = contractStats(todayRecords);
      const monthContracts = contractStats(monthRecords);
      const checkedInCount = todayBookings.filter(eventIsCheckedIn).length;
      const activeMemberCount = new Set(monthBookings.flatMap(item => item.memberIds || []).filter(Boolean)).size;
      const todayKey = days.find(day => getDayNumber(day.key) === currentCalendarDayNumber())?.key || "fri";
      const fullSlots = times.filter(time => capacityFor(todayKey, time).general >= 3).length;
      const monthClassRevenue = monthBookings.reduce((sum, event) => sum + bookingSalesValue(event), 0);
      const payrollTotal = staffMembers.reduce((sum, staff) => sum + staffCompensation(staff, monthBookings).total, 0);
      operationsMetrics.innerHTML = `
        <div class="staff-metric"><span>當月營業額</span><strong>${money(monthRevenue)}</strong></div>
        <div class="staff-metric"><span>當月銷課總金額</span><strong>${money(monthClassRevenue)}</strong></div>
        <div class="staff-metric"><span>當月總課堂數</span><strong>${monthBookings.length}</strong></div>
        <div class="staff-metric"><span>預估薪資總額</span><strong>${money(payrollTotal)}</strong></div>
      `;
      const coachStats = {};
      monthBookings.forEach(event => {
        const coach = bookingCoachName(event);
        if (!coachStats[coach]) coachStats[coach] = { revenue: 0, classes: 0, members: new Set() };
        coachStats[coach].revenue += bookingSalesValue(event);
        coachStats[coach].classes += 1;
        (event.memberIds || []).forEach(id => coachStats[coach].members.add(id));
      });
      const coachRows = Object.entries(coachStats).length
        ? Object.entries(coachStats).map(([coach, stats]) => `<li>${coach}｜銷課 ${money(stats.revenue)}｜${stats.classes} 堂｜${stats.members.size} 位會員</li>`).join("")
        : `<li>本月尚無教練上課資料。</li>`;
      const compensationRows = staffMembers
        .filter(staff => staff.role.includes("教練"))
        .map(staff => {
          const pay = staffCompensation(staff);
          const stats = getStaffStats(staff);
          return `<li>${staff.displayName}｜${staff.role}${staff.level ? staff.level : ""}｜底薪 ${money(pay.basePay)}｜堂獎 ${money(pay.classBonusTotal)}｜估算 ${money(pay.total)}｜${stats.classCount} 堂</li>`;
        }).join("") || `<li>尚未建立教練薪資資料。</li>`;
      const todayRows = todayBookings.length
        ? todayBookings.map(item => `<li>${item.time}｜${item.title}｜${bookingMemberNames(item)}｜${eventIsCheckedIn(item) ? "已簽到" : "未簽到"}</li>`).join("")
        : `<li>今日尚無預約。</li>`;
      const revenueRows = `
        <li>當日收款：${money(todayRevenue)}｜新約 ${todayContracts.newCount}｜續約 ${todayContracts.renewCount}</li>
        <li>當月收款：${money(monthRevenue)}｜新約 ${monthContracts.newCount}｜續約 ${monthContracts.renewCount}</li>
        <li>當月上課會員數：${activeMemberCount} 位｜今日已簽到 ${checkedInCount} 筆｜滿額時段 ${fullSlots} 個</li>
      `;
      const activityRows = activityLogs.length
        ? activityLogs.slice(0, 5).map(log => `<li>${log.time}｜${log.action}｜${log.text}</li>`).join("")
        : `<li>目前沒有課程調整紀錄。</li>`;
      const employeeRows = staffMembers.map(staff => {
        const stats = getStaffStats(staff);
        const pay = staffCompensation(staff, monthBookings);
        const sales = staffSalesAmount(staff, monthRecords);
        const revenue = staffRevenueAmount(staff, monthBookings);
        return `
          <tr>
            <td><strong>${staff.displayName}</strong><span>${pay.rule.label}｜${staff.role}${staff.level ? staff.level : ""}</span></td>
            <td>${money(sales)}</td>
            <td>${stats.classCount}</td>
            <td>${money(revenue)}</td>
            <td>${staff.dutyHours || 0}</td>
            <td><strong>${money(pay.total)}</strong><span>底薪 ${money(pay.basePay)}｜時薪 ${money(pay.hourlyPay)}｜堂獎 ${money(pay.classBonusTotal)}｜分潤 ${money(pay.revenueShare)}</span></td>
          </tr>
        `;
      }).join("");
      const salaryRows = salaryRules.map(rule => `
        <tr>
          <td><strong>${rule.label}</strong><span>${rule.note}</span></td>
          <td><input class="salary-input" type="number" min="0" step="100" value="${rule.basePay}" data-salary-key="${rule.key}" data-salary-field="basePay" aria-label="${rule.label}底薪"></td>
          <td><input class="salary-input" type="number" min="0" step="10" value="${rule.hourlyRate}" data-salary-key="${rule.key}" data-salary-field="hourlyRate" aria-label="${rule.label}時薪"></td>
          <td><input class="salary-input" type="number" min="0" step="50" value="${rule.classBonus}" data-salary-key="${rule.key}" data-salary-field="classBonus" aria-label="${rule.label}堂獎"></td>
          <td><input class="salary-input percent" type="number" min="0" max="100" step="1" value="${rule.revenueRate}" data-salary-key="${rule.key}" data-salary-field="revenueRate" aria-label="${rule.label}分潤比例"> %</td>
        </tr>
      `).join("");
      operationsPanel.innerHTML = `
        <div class="operations-summary">
          <div class="history-block">
            <div class="history-title">當月總資訊</div>
            <ul class="history-list">${revenueRows}</ul>
          </div>

          <div class="operations-layout">
            <div class="ops-card">
              <div>
                <h3>各員工當月表現</h3>
                <p>業績以儲值收款人估算，營收以實際銷課教練估算；後續補齊資料後會更準。</p>
              </div>
              <div class="ops-table-wrap">
                <table class="ops-table">
                  <thead>
                    <tr>
                      <th>員工</th>
                      <th>業績</th>
                      <th>課堂數</th>
                      <th>營收</th>
                      <th>值班時數</th>
                      <th>預估薪資</th>
                    </tr>
                  </thead>
                  <tbody>${employeeRows}</tbody>
                </table>
              </div>
            </div>

            <div class="ops-card">
              <div>
                <h3>薪資計算級距</h3>
                <p>調整後會立即重新估算左側薪資，方便比較店長、正職、兼職、合作與工讀級距。</p>
              </div>
              <div class="ops-table-wrap">
                <table class="ops-table">
                  <thead>
                    <tr>
                      <th>職等</th>
                      <th>底薪</th>
                      <th>時薪</th>
                      <th>堂獎</th>
                      <th>分潤</th>
                    </tr>
                  </thead>
                  <tbody>${salaryRows}</tbody>
                </table>
              </div>
              <div class="ops-note">目前是第一版估算：正職以底薪加堂獎、兼職以堂獎、合作以銷課營收分潤、工讀以時薪乘值班時數。實際發薪前仍建議人工複核一次。</div>
            </div>
          </div>

          <div class="history-block">
            <div class="history-title">教練銷課統計</div>
            <ul class="history-list">${coachRows}</ul>
          </div>
          <div class="history-block">
            <div class="history-title">今日課程</div>
            <ul class="history-list">${todayRows}</ul>
          </div>
          <div class="history-block">
            <div class="history-title">最近課程調整</div>
            <ul class="history-list">${activityRows}</ul>
          </div>
        </div>
      `;
      operationsPanel.querySelectorAll("[data-salary-key]").forEach(input => {
        input.addEventListener("change", async () => {
          const rule = salaryRules.find(item => item.key === input.dataset.salaryKey);
          if (!rule) return;
          if (!(await confirmChange("確認要修改薪資計算設定嗎？"))) return;
          rule[input.dataset.salaryField] = Math.max(0, Number(input.value) || 0);
          saveAppData();
          renderOperationsSummary();
        });
      });
    }

    function renderMemberSelect() {
      const selectedMember = members.find(member => member.id === bookingMemberId);
      memberSelect.value = selectedMember ? bookingMemberOptionLabel(selectedMember) : "";
    }

    function teachingStaffMembers() {
      return staffMembers.filter(staff => String(staff.role || "").includes("教練"));
    }

    function renderCoachOptions() {
      const selectedCoach = coachName.value;
      const selectedDetailCoach = detailCoachSelect.value;
      const options = [
        ...teachingStaffMembers().map(staff => `<option value="${staff.displayName}">${staff.displayName}</option>`),
        `<option value="不指定">不指定</option>`
      ].join("");
      coachName.innerHTML = options;
      detailCoachSelect.innerHTML = options;
      coachName.value = [...coachName.options].some(option => option.value === selectedCoach)
        ? selectedCoach
        : (coachName.options[0]?.value || "不指定");
      detailCoachSelect.value = [...detailCoachSelect.options].some(option => option.value === selectedDetailCoach)
        ? selectedDetailCoach
        : (detailCoachSelect.options[0]?.value || "不指定");
      syncCoachFieldState();
    }

    function renderBookingTypeOptions() {
      const currentValue = bookingType.value;
      const options = bookingTypeOptions.filter(option => {
        if (!option.value.startsWith("friendly-")) return true;
        return isFriendlyAvailable(bookingDay.value, bookingTime.value);
      });
      bookingType.innerHTML = options.map(option => `<option value="${option.value}">${option.label}</option>`).join("");
      bookingType.value = options.some(option => option.value === currentValue) ? currentValue : (options[0]?.value || "coaching-1v1");
    }

    function renderProfileSelect() {
      const selectedMember = members.find(member => member.id === profileMemberId);
      memberProfileSelect.value = selectedMember ? bookingMemberOptionLabel(selectedMember) : "";
    }

    function latestMemberBooking(memberId) {
      const events = getMemberEvents(memberId);
      return events.length ? events[events.length - 1] : null;
    }

    function memberActivityLabel(memberId) {
      const event = latestMemberBooking(memberId);
      const member = members.find(item => item.id === memberId);
      return event ? `${formatBookingDate(event)} ${event.time}` : (member?.lastBookingAt || "-");
    }

    function memberLatestClassStatus(member) {
      const event = latestMemberBooking(member.id);
      return event ? `${formatBookingDate(event)} ${event.time}` : (member.lastBookingAt || "尚無上課紀錄");
    }

    function renderMemberSummaryMetrics() {
      const activeCount = new Set(operationBookingScope("month").flatMap(event => event.memberIds || []).filter(Boolean)).size;
      const newCount = members.filter(member => String(member.registeredAt || "").startsWith("2026/05")).length;
      const renewCount = allRechargeRecords().filter(record => {
        const info = recordDateInfo(record);
        const key = String(record.planKey || record.pricePlan || "");
        const label = String(record.typeLabel || "");
        return info.month === "2026/05" && (key.includes("Renew") || key.includes("renew") || label.includes("續約"));
      }).length;
      memberSummaryMetrics.innerHTML = `
        <div class="staff-metric"><span>本月活躍客人</span><strong>${activeCount}</strong></div>
        <div class="staff-metric"><span>本月新增客戶</span><strong>${newCount}</strong></div>
        <div class="staff-metric"><span>本月續約客戶</span><strong>${renewCount}</strong></div>
      `;
      memberSortButtons?.querySelectorAll("[data-member-sort]").forEach(button => {
        button.classList.toggle("active", button.dataset.memberSort === (memberSortMode?.value || "registeredDesc"));
      });
    }

    function memberHasTicketType(member, type) {
      syncWalletFromBuckets(member);
      if (type === "none") {
        return ["course", "group", "selfTraining", "friendlySelfTraining", "massage"].every(key => Math.max(0, Number(member.ticketWallet?.[key]) || 0) <= 0);
      }
      return Math.max(0, Number(member.ticketWallet?.[type]) || 0) > 0;
    }

    function memberNeedsRenewSoon(member) {
      syncWalletFromBuckets(member);
      const classBuckets = (member.ticketBuckets || [])
        .filter(bucket => ["course", "group"].includes(bucket.type))
        .filter(bucket => Math.max(0, Number(bucket.remaining) || 0) > 0);
      if (!classBuckets.length) return false;
      return classBuckets.some(bucket => Math.max(0, Number(bucket.remaining) || 0) <= 1);
    }

    function memberHasMonthBooking(member) {
      return getMemberEvents(member.id).some(event => String(formatBookingDate(event) || "").startsWith("2026/05"));
    }

    function memberMatchesDirectoryKeyword(member, keyword) {
      if (!keyword) return true;
      const normalizedPhone = normalizePhoneNumber(keyword);
      const fields = [
        member.name,
        member.phone,
        normalizePhoneNumber(member.phone),
        member.lineId,
        member.importNote
      ];
      return fields.some(value => String(value || "").toLowerCase().includes(keyword))
        || (normalizedPhone && normalizePhoneNumber(member.phone).includes(normalizedPhone));
    }

    function memberMatchesFilters(member) {
      const keyword = memberDirectoryKeyword.trim().toLowerCase();
      if (!memberMatchesDirectoryKeyword(member, keyword)) return false;
      if (memberLevelFilterValue !== "all" && normalizeIdentity(member.identity) !== memberLevelFilterValue) return false;
      if (memberTicketFilterValue !== "all" && !memberHasTicketType(member, memberTicketFilterValue)) return false;
      if (memberStatusFilterValue === "activeMonth" && !memberHasMonthBooking(member)) return false;
      if (memberStatusFilterValue === "noBooking" && getMemberEvents(member.id).length > 0) return false;
      if (memberStatusFilterValue === "renewSoon" && !memberNeedsRenewSoon(member)) return false;
      if (memberStatusFilterValue === "storedCredit" && memberStoreCreditAmount(member) <= 0) return false;
      return true;
    }

    function sortedMembers() {
      const mode = memberSortMode?.value || "registeredDesc";
      return [...members].filter(memberMatchesFilters).sort((a, b) => {
        if (mode === "registeredAsc") return String(a.registeredAt || "").localeCompare(String(b.registeredAt || ""));
        if (mode === "identity") return normalizeIdentity(a.identity).localeCompare(normalizeIdentity(b.identity)) || a.name.localeCompare(b.name);
        if (mode === "activity" || mode === "activityAsc") {
          const aEvent = latestMemberBooking(a.id);
          const bEvent = latestMemberBooking(b.id);
          const aValue = aEvent ? `${getBookingDayNumber(aEvent)} ${aEvent.time}` : String(a.lastBookingAt || "");
          const bValue = bEvent ? `${getBookingDayNumber(bEvent)} ${bEvent.time}` : String(b.lastBookingAt || "");
          return mode === "activityAsc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        return String(b.registeredAt || "").localeCompare(String(a.registeredAt || ""));
      });
    }

    function renderMemberDirectory() {
      renderMemberSummaryMetrics();
      memberProfile.innerHTML = "";
      if (!memberTestGrid) return;
      const list = sortedMembers();
      const totalPages = Math.max(1, Math.ceil(list.length / memberPageSize));
      memberCurrentPage = Math.min(Math.max(1, memberCurrentPage), totalPages);
      const start = (memberCurrentPage - 1) * memberPageSize;
      const pageMembers = list.slice(start, start + memberPageSize);
      const rows = pageMembers.map(member => `
        <tr data-open-member-id="${member.id}">
          <td>${member.registeredAt || "-"}</td>
          <td><strong>${member.name}</strong></td>
          <td>${displayPhone(member.phone)}</td>
          <td>${normalizeIdentity(member.identity)}</td>
          <td><span class="ticket-tags">${memberTicketTags(member)}</span></td>
          <td>${memberActivityLabel(member.id)}</td>
          <td><button class="admin-action-btn" type="button">查看</button></td>
        </tr>
      `).join("") || `<tr><td colspan="7">找不到符合的會員</td></tr>`;
      memberTestGrid.innerHTML = `
        <div class="member-table-wrap admin-table-wrap">
          <table class="member-table admin-table">
            <thead>
              <tr>
                <th>註冊日期</th>
                <th>姓名</th>
                <th>電話</th>
                <th>等級</th>
                <th>票券</th>
                <th>活躍度</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="member-pager">
            <div class="member-page-nav">
              <button type="button" data-member-page-prev ${memberCurrentPage <= 1 ? "disabled" : ""}>上一頁</button>
              <span>${memberCurrentPage} / ${totalPages}，共 ${list.length} 名｜每頁 20 名</span>
              <button type="button" data-member-page-next ${memberCurrentPage >= totalPages ? "disabled" : ""}>下一頁</button>
            </div>
          </div>
        </div>
      `;
      memberTestGrid.querySelector("[data-member-page-prev]")?.addEventListener("click", async event => {
        event.stopPropagation();
        memberCurrentPage = Math.max(1, memberCurrentPage - 1);
        renderMemberDirectory();
      });
      memberTestGrid.querySelector("[data-member-page-next]")?.addEventListener("click", async event => {
        event.stopPropagation();
        memberCurrentPage = Math.min(totalPages, memberCurrentPage + 1);
        renderMemberDirectory();
      });
    }

    function escapeHtml(value = "") {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
    }

    function memberFieldValue(member, field) {
      if (field === "phone") return displayPhone(member.phone) || "未填";
      if (field === "identity") return normalizeIdentity(member.identity) || "未設定";
      if (field === "gender") return member.gender || "未填";
      if (field === "birthday") return member.birthday || "未填";
      if (field === "lineId") return member.lineId || "未填";
      return member.name || "未填";
    }

    function memberInlineFieldMarkup(member, field, label) {
      return `
        <button class="member-editable-field" type="button" data-edit-member-field="${field}">
          <span>${label}</span>
          <strong>${escapeHtml(memberFieldValue(member, field))}</strong>
        </button>
      `;
    }

    function renderMemberEditableMeta(member, latestClass) {
      return `
        ${memberInlineFieldMarkup(member, "name", "姓名")}
        ${memberInlineFieldMarkup(member, "phone", "電話")}
        ${memberInlineFieldMarkup(member, "identity", "等級")}
        <div class="member-readonly-field">
          <span>註冊</span>
          <strong>${escapeHtml(member.registeredAt || "-")}</strong>
        </div>
        ${memberInlineFieldMarkup(member, "gender", "性別")}
        ${memberInlineFieldMarkup(member, "birthday", "生日")}
        ${memberInlineFieldMarkup(member, "lineId", "LINE")}
        <div class="member-readonly-field">
          <span>狀態</span>
          <strong>${escapeHtml(latestClass)}</strong>
        </div>
      `;
    }

    function memberFieldEditorInput(member, field) {
      if (field === "identity") {
        return `
          <select data-inline-input>
            ${["新朋友", "會員", "主顧客"].map(identity => `<option value="${identity}" ${identity === normalizeIdentity(member.identity) ? "selected" : ""}>${identity}</option>`).join("")}
          </select>
        `;
      }
      if (field === "gender") {
        return `
          <select data-inline-input>
            ${["", "女", "男", "其他"].map(gender => `<option value="${gender}" ${gender === (member.gender || "") ? "selected" : ""}>${gender || "未填"}</option>`).join("")}
          </select>
        `;
      }
      if (field === "birthday") {
        return `<input data-inline-input type="date" value="${dateInputValue(member.birthday)}">`;
      }
      const type = field === "phone" ? "tel" : "text";
      const value = field === "phone" ? displayPhone(member.phone) : (member[field] || "");
      return `<input data-inline-input type="${type}" value="${escapeHtml(value)}">`;
    }

    async function saveMemberInlineField(member, field, value) {
      if (field === "phone") {
        const nextPhone = normalizePhoneNumber(value);
        const duplicatedPhoneMember = members.find(item => item.id !== member.id && normalizePhoneNumber(item.phone) === nextPhone);
        if (!nextPhone) {
          formMessage.className = "message error";
          formMessage.textContent = "會員電話不可空白。";
          return false;
        }
        if (duplicatedPhoneMember) {
          formMessage.className = "message error";
          formMessage.textContent = `電話 ${nextPhone} 已經存在於 ${duplicatedPhoneMember.name}，請確認後再儲存。`;
          return false;
        }
        member.phone = nextPhone;
        return true;
      }
      if (field === "name") {
        const nextName = String(value || "").trim();
        if (!nextName) {
          formMessage.className = "message error";
          formMessage.textContent = "會員姓名不可空白。";
          return false;
        }
        member.name = nextName;
        return true;
      }
      if (field === "identity") {
        member.identity = normalizeIdentity(value);
        return true;
      }
      if (field === "birthday") {
        member.birthday = String(value || "").replaceAll("-", "/");
        return true;
      }
      if (field === "gender") {
        member.gender = value || "";
        return true;
      }
      if (field === "lineId") {
        member.lineId = String(value || "").trim();
        return true;
      }
      return false;
    }

    function bindMemberInlineEdit(member, rerender) {
      memberDetailProfile.querySelectorAll("[data-edit-member-field]").forEach(button => {
        button.addEventListener("click", event => {
          event.stopPropagation();
          if (button.classList.contains("editing")) return;
          const field = button.dataset.editMemberField;
          const label = button.querySelector("span")?.textContent || "資料";
          button.classList.add("editing");
          button.innerHTML = `
            <div class="member-inline-editor">
              <span>${label}</span>
              ${memberFieldEditorInput(member, field)}
              <div class="inline-edit-actions">
                <button type="button" data-inline-cancel>取消</button>
                <button type="button" data-inline-save>儲存</button>
              </div>
            </div>
          `;
          const input = button.querySelector("[data-inline-input]");
          input?.focus();
          input?.select?.();
          button.querySelector("[data-inline-cancel]")?.addEventListener("click", cancelEvent => {
            cancelEvent.stopPropagation();
            rerender();
          });
          button.querySelector("[data-inline-save]")?.addEventListener("click", async saveEvent => {
            saveEvent.stopPropagation();
            if (!(await confirmChange(`確認要更新 ${member.name} 的${label}嗎？`))) return;
            const ok = await saveMemberInlineField(member, field, input?.value || "");
            if (!ok) return;
            saveAppData();
            renderMemberDirectory();
            renderMemberSelect();
            renderProfileSelect();
            rerender();
          });
        });
      });
    }

    function openMemberCardById(memberId) {
      const member = members.find(item => item.id === memberId);
      if (!member) return;
      profileMemberId = member.id;
      memberRechargeNotice = "";
      member.ticketWallet = member.ticketWallet || {};
      member.bonusWallet = member.bonusWallet || {};
      member.ticketBuckets = member.ticketBuckets || [];
      syncWalletFromBuckets(member);

      const ticketRows = renderMemberTicketUsage(member);
      const latestClass = memberLatestClassStatus(member);
      memberDetailTitle.textContent = member.name;
      memberDetailSubtitle.textContent = `${displayPhone(member.phone)}｜${normalizeIdentity(member.identity) || "未設定等級"}`;
      memberDetailProfile.innerHTML = `
        <div class="member-card-overview">
          <div class="member-id-card simple-member-card">
            <div class="member-id-card-top">
              <div>
                <h3>${member.name}</h3>
                <p>點選下方欄位即可修改資料</p>
              </div>
            </div>
            <div class="member-kpi-row three">
              <div class="member-kpi">
                <span>已消費金額</span>
                <strong>${money(memberSpentAmount(member))}</strong>
              </div>
              <div class="member-kpi">
                <span>使用課堂數</span>
                <strong>${memberUsedClassCount(member)}</strong>
              </div>
              <div class="member-kpi">
                <span>儲值金額</span>
                <strong>${money(memberStoreCreditAmount(member))}</strong>
              </div>
              <div class="member-kpi recharge-kpi">
                <button type="button" data-open-recharge="renew">儲值</button>
              </div>
            </div>
            <div class="member-card-meta">
              ${renderMemberEditableMeta(member, latestClass)}
            </div>
          </div>
          <div class="ticket-wallet-card">
            <div class="ticket-wallet-header">
              <div class="history-title">會員票券</div>
              <div class="ticket-usage-head">
                <span aria-hidden="true"></span>
                <span>使用</span>
                <span>剩餘</span>
                <span>總數</span>
              </div>
            </div>
            ${renderTicketFilterTabs()}
            <div class="ticket-usage-list">${ticketRows}</div>
          </div>
        </div>
      `;
      memberDetailHistoryPanel.innerHTML = "";
      memberDetailModal.classList.add("open");
      memberDetailModal.setAttribute("aria-hidden", "false");
      memberDetailMonthCalendar.innerHTML = "";
      bindRechargeLaunchControls();
      bindMemberInlineEdit(member, () => openMemberCardById(member.id));
      bindMemberCardTicketFilter(() => openMemberCardById(member.id));
      bindTicketEditControls(member, () => openMemberCardById(member.id));
      memberDetailModal.classList.add("open");
      memberDetailModal.setAttribute("aria-hidden", "false");
    }

    function ticketBadgeClass(member) {
      if (member.tickets <= 0) return "empty";
      if (member.tickets <= 2) return "low";
      return "";
    }

    function renderOwnedTicketRows(member) {
      const rows = [
        member.ticketWallet.course ? `課程票券：${member.ticketWallet.course} 堂` : "",
        member.bonusWallet.course ? `贈送課程：${member.bonusWallet.course} 堂` : "",
        member.ticketWallet.selfTraining ? `自主訓練：${member.ticketWallet.selfTraining} 點${member.ticketExpiry.selfTraining ? `，期限 ${member.ticketExpiry.selfTraining}` : ""}` : "",
        member.ticketWallet.friendlySelfTraining ? `友善自主：${member.ticketWallet.friendlySelfTraining} 點${member.ticketExpiry.friendlySelfTraining ? `，期限 ${member.ticketExpiry.friendlySelfTraining}` : ""}，限平日離峰使用` : "",
        member.ticketWallet.group ? `小班團課：${member.ticketWallet.group} 堂${member.ticketExpiry.group ? `，期限 ${member.ticketExpiry.group}` : ""}` : "",
        member.bonusWallet.group ? `贈送團課：${member.bonusWallet.group} 堂` : "",
        member.ticketWallet.massage ? `運動按摩：${member.ticketWallet.massage} 堂` : ""
      ].filter(Boolean);
      return rows.length
        ? rows.map(row => `<span>${row}</span>`).join("")
        : `<span>票券：目前沒有可用票券</span>`;
    }

    function renderRechargeHistory(member) {
      if (!member.rechargeHistory.length) return `<li>目前沒有儲值紀錄</li>`;
      return member.rechargeHistory.map(record => {
        const fee = record.collectedAmountText || record.priceText || "-";
        const course = [
          record.typeLabel || ticketTypeLabel(record.type),
          record.peoplePlan ? (record.peoplePlan === "1v2" ? "1 對 2" : "1 對 1") : ""
        ].filter(Boolean).join(" ");
        const sessions = `${record.unlockedSessions || record.count || 0} 堂${record.bonusGift ? ` + 贈 ${record.bonusGift}` : ""}`;
        const installment = record.installmentText || record.paymentLabel || "-";
        return `<li>${record.date || "-"}｜${fee}｜${course || "-"}｜${sessions}｜${installment}</li>`;
      }).join("");
    }

    function renderBookingHistory(member, memberEvents) {
      if (!memberEvents.length) return `<li>目前沒有預約紀錄</li>`;
      return memberEvents.map(event => {
        const progress = compactProgressText(member, event);
        const sessions = progress ? `(${progress})` : "-";
        return `<li>${formatBookingDate(event)} ${event.time}｜-｜${courseShortTag(event)}｜${sessions}｜-</li>`;
      }).join("");
    }

    function memberSpentAmount(member) {
      return (member.rechargeHistory || []).reduce((sum, record) => sum + recordAmount(record), 0);
    }

    function memberStoreCreditAmount(member) {
      return Math.max(0, Number(member.storeCredit) || 0);
    }

    function displayTicketLabel(label = "") {
      const clean = String(label || "").replace(/\s*第\s*\d+\s*期.*/, "");
      if (clean === "教練1") return "教練1V1";
      if (clean === "教練2") return "教練1V2";
      if (clean === "友善1") return "友善1V1";
      if (clean === "友善2") return "友善1V2";
      return clean;
    }

    function memberUsedClassCount(member) {
      return getMemberEvents(member.id).filter(event => event.status !== "cancelled" && event.kind !== "self").length;
    }

    function parseMoneyText(text = "") {
      return Number(String(text).replace(/[^\d]/g, "")) || 0;
    }

    function splitInstallment(total, parts) {
      const base = Math.floor(total / parts);
      const remainder = total % parts;
      return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
    }

    function installmentPartValue(total, part, parts) {
      return splitInstallment(total, parts)[part - 1] || 0;
    }

    function installmentAmountValue(quote, sessions) {
      if (quote.unit) return Math.round(quote.unit * sessions);
      const paidSessions = quote.paidSessions || quote.totalSessions || 1;
      return Math.round((quote.price / paidSessions) * sessions);
    }

    function paymentPartsFromLabel(label = "") {
      const match = label.match(/分\s*(\d+)\s*期/);
      return match ? Number(match[1]) : 0;
    }

    function getActivePaymentShortcut(member) {
      for (const record of member.rechargeHistory) {
        const parts = paymentPartsFromLabel(record.paymentLabel);
        if (!parts || !record.planKey || !record.type) continue;
        const paidRecords = member.rechargeHistory.filter(item =>
          item.type === record.type &&
          item.planKey === record.planKey &&
          item.planSessions === record.planSessions &&
          item.paymentLabel === record.paymentLabel
        );
        if (paidRecords.length >= parts) continue;
        const nextPart = paidRecords.length + 1;
        const planPrice = record.price || parseMoneyText(record.priceText);
        return {
          type: record.type,
          planKey: record.planKey,
          planSessions: record.planSessions,
          paymentMode: `installment${parts}`,
          nextPart,
          nextSessions: installmentPartValue(record.planSessions, nextPart, parts),
          nextAmount: Math.round((record.unit || (planPrice / record.planSessions)) * installmentPartValue(record.planSessions, nextPart, parts)),
          label: `${record.typeLabel}${record.peoplePlan ? `｜${record.peoplePlan === "1v2" ? "1 對 2" : "1 對 1"}` : ""}`
        };
      }
      return null;
    }

    function renderCurrentPlanShortcut(member) {
      const shortcut = getActivePaymentShortcut(member);
      if (!shortcut) {
        return "";
      }
      return `
        <div class="price-preview quick-plan">
          <p><strong>目前方案：</strong>${shortcut.label}</p>
          <p><strong>下一期：</strong>第 ${shortcut.nextPart} 期</p>
          <p><strong>開放堂數：</strong>${shortcut.nextSessions} 堂</p>
          <p><strong>應收金額：</strong>${money(shortcut.nextAmount)}</p>
          <button class="secondary-btn" type="button" id="quickPaymentBtn">帶入下一期付款</button>
        </div>
      `;
    }

    function rechargePriceOptions(member) {
      const identity = normalizeIdentity(member.identity);
      if (identity === "主顧客") {
        return [
          { value: "single1800", label: "單堂 1800" },
          { value: "oldRenew1500", label: "主顧客續約 1V1 1500 / 堂" },
          { value: "oldRenew1800", label: "主顧客續約 1V2 1800 / 堂" },
          { value: "friendly1300", label: "友善方案 1V1 1300 / 堂" },
          { value: "friendly1600", label: "友善方案 1V2 1600 / 堂" }
        ];
      }
      if (identity === "新朋友") {
        return [
          { value: "single1800", label: "單堂 1800" },
          { value: "new1600", label: "新客方案 1V1 1600 / 堂" },
          { value: "new1900", label: "新客方案 1V2 1900 / 堂" },
          { value: "friendly1300", label: "友善方案 1V1 1300 / 堂" },
          { value: "friendly1600", label: "友善方案 1V2 1600 / 堂" }
        ];
      }
      return [
        { value: "single1800", label: "單堂 1800" },
        { value: "renew1530", label: "會員續約 1V1 1530 / 堂" },
        { value: "renew1830", label: "會員續約 1V2 1830 / 堂" },
        { value: "friendly1300", label: "友善方案 1V1 1300 / 堂" },
        { value: "friendly1600", label: "友善方案 1V2 1600 / 堂" }
      ];
    }

    function renderMemberProfile() {
      const member = getProfileMember();
      if (!member) {
        renderMemberDirectory();
        memberMonthCalendar.innerHTML = "";
        memberHistoryPanel.innerHTML = "";
        return;
      }
      const memberEvents = getMemberEvents(member.id);
      const latestClass = memberLatestClassStatus(member);
      memberDetailTitle.textContent = member.name;
      memberDetailSubtitle.textContent = `${displayPhone(member.phone)}｜${normalizeIdentity(member.identity) || "未設定等級"}`;
      memberDetailProfile.innerHTML = `
        <div class="member-card-overview">
          <div class="member-id-card">
            <div class="member-id-card-top">
              <div>
                <h3>${member.name}</h3>
                <p>點選下方欄位即可修改資料</p>
              </div>
            </div>
            <div class="member-kpi-row three">
              <div class="member-kpi">
                <span>已消費金額</span>
                <strong>${money(memberSpentAmount(member))}</strong>
              </div>
              <div class="member-kpi">
                <span>使用課堂數</span>
                <strong>${memberUsedClassCount(member)}</strong>
              </div>
              <div class="member-kpi">
                <span>儲值金額</span>
                <strong>${money(memberStoreCreditAmount(member))}</strong>
              </div>
              <div class="member-kpi recharge-kpi">
                <button type="button" data-open-recharge="renew">儲值</button>
              </div>
            </div>
            <div class="member-card-meta">
              ${renderMemberEditableMeta(member, latestClass)}
            </div>
          </div>
          <div class="ticket-wallet-card">
            <div class="ticket-wallet-header">
              <div class="history-title">會員票券</div>
              <div class="ticket-usage-head">
                <span aria-hidden="true"></span>
                <span>使用票券</span>
                <span>剩餘票券</span>
                <span>總票券</span>
              </div>
            </div>
            ${renderTicketFilterTabs()}
            <div class="ticket-usage-list">${renderMemberTicketUsage(member)}</div>
          </div>
        </div>
        <div class="recharge-box">
          <div class="history-title">儲值票券快捷區</div>
          <div class="message recharge-notice ${memberRechargeNotice ? "" : "hidden"}" id="memberRechargeNotice">${memberRechargeNotice}</div>
          ${renderCurrentPlanShortcut(member)}
        </div>
      `;
      bindRechargeLaunchControls();
      bindMemberInlineEdit(member, () => renderMemberProfile());
      bindMemberCardTicketFilter(() => renderMemberProfile());
      bindTicketEditControls(member, () => renderMemberProfile());
      memberMonthCalendar.innerHTML = "";
      memberHistoryPanel.innerHTML = "";
      memberDetailModal.classList.add("open");
      memberDetailModal.setAttribute("aria-hidden", "false");
      memberDetailMonthCalendar.innerHTML = "";
      try {
        renderMemberHistoryPanel(member, memberDetailHistoryPanel);
      } catch (error) {
        console.error("Member detail history render failed", error);
        memberDetailHistoryPanel.innerHTML = "";
      }
    }

    function renderMemberHistoryPanel(memberOverride = getProfileMember(), target = memberHistoryPanel) {
      const member = memberOverride;
      if (!member) {
        target.innerHTML = "";
        return;
      }
      const memberEvents = getMemberEvents(member.id);
      target.innerHTML = `
        <div class="history-block">
          <div class="history-title">儲值紀錄｜日期｜費用｜課程｜堂數｜期數</div>
          <ul class="history-list">
            ${renderRechargeHistory(member)}
          </ul>
        </div>
        <div class="history-block">
          <div class="history-title">預約紀錄｜日期｜費用｜課程｜堂數｜期數</div>
          <ul class="history-list">
            ${renderBookingHistory(member, memberEvents)}
          </ul>
        </div>
      `;
    }

    function ticketTypeLabel(type) {
      if (type === "course") return "教練 / 課程票券";
      if (type === "selfTraining") return "自主訓練";
      if (type === "friendlySelfTraining") return "友善自主";
      if (type === "group") return "團體課票券";
      if (type === "massage") return "運動按摩";
      return "票券";
    }

    function needsExpiry(type) {
      return type === "selfTraining" || type === "friendlySelfTraining" || type === "group";
    }

    function getCoursePricing(pricePlan, count, peoplePlan = "1v1") {
      const newGift = { 8: 0, 16: 1, 24: 3 };
      const renewGift = { 10: 0, 20: 2, 30: 4 };
      const plus = 0;
      if (pricePlan === "single1800") {
        const unit = 1800 + plus;
        return {
          valid: count === 1,
          unit,
          plus,
          gift: 0,
          total: unit,
          note: "單堂預約"
        };
      }
      if (pricePlan === "vip1100") {
        return {
          valid: count === 20,
          unit: 1100,
          plus: 0,
          gift: 0,
          total: 20 * 1100,
          note: count === 20 ? "VIP 收費一次 20 堂" : "VIP 方案固定一次 20 堂"
        };
      }
      if (pricePlan === "friendly1300" || pricePlan === "friendly1600") {
        const unit = pricePlan === "friendly1600" ? 1600 : 1300;
        return {
          valid: count === 12,
          unit,
          plus: 0,
          gift: 0,
          total: count * unit,
          note: "友善方案固定 12 堂"
        };
      }
      if (pricePlan === "oldRenew1500" || pricePlan === "oldRenew1800") {
        const base = pricePlan === "oldRenew1500" ? 1500 : 1800;
        const unit = base + plus;
        return {
          valid: Object.prototype.hasOwnProperty.call(renewGift, count),
          unit,
          plus,
          gift: renewGift[count] || 0,
          total: count * unit,
          note: "老顧客續約：10/20/30 堂，贈送 0/2/4 堂"
        };
      }
      if (pricePlan.startsWith("new")) {
        const base = pricePlan === "new1600" ? 1600 : 1900;
        const unit = base + plus;
        return {
          valid: Object.prototype.hasOwnProperty.call(newGift, count),
          unit,
          plus,
          gift: newGift[count] || 0,
          total: count * unit,
          note: "新客定價：8/16/24 堂，贈送 0/1/3 堂"
        };
      }
      const base = pricePlan === "renew1530" ? 1530 : 1830;
      const unit = base + plus;
      return {
        valid: Object.prototype.hasOwnProperty.call(renewGift, count),
        unit,
        plus,
        gift: renewGift[count] || 0,
        total: count * unit,
        note: "續約方案：10/20/30 堂，贈送 0/2/4 堂"
      };
    }

    function money(value) {
      return `$${value.toLocaleString("zh-TW")}`;
    }

    function getRechargeQuote(type, count, pricePlan, peoplePlan = "1v1") {
      if (type === "group") {
        return getGroupClassQuote(document.querySelector("#groupClassPlan")?.value || "groupTrial", count);
      }
      if (type !== "course") {
        const unit = type === "massage" ? 1500 : 0;
        const total = count * unit;
        return {
          valid: true,
          gift: 0,
          paidSessions: count,
          totalSessions: count,
          price: total,
          priceText: type === "massage" ? money(total) : "免收費",
          message: type === "massage"
            ? `運動按摩固定 ${money(unit)} / 堂，${count} 堂共 ${money(total)}。`
            : `${ticketTypeLabel(type)} ${count} 堂，不用費用。`
        };
      }
      const pricing = getCoursePricing(pricePlan, count, peoplePlan);
      return {
        valid: pricing.valid,
        gift: pricing.gift,
        paidSessions: count,
        totalSessions: count + pricing.gift,
        unit: pricing.unit,
        price: pricing.total,
        priceText: money(pricing.total),
        message: pricing.valid
          ? `${count} 堂 ${money(pricing.total)}${pricing.gift ? `，贈送 ${pricing.gift} 堂` : ""}。`
          : `這個堂數不符合此價格方案。${pricing.note}`
      };
    }

    function fixedCourseCount(pricePlan) {
      if (pricePlan === "single1800") return 1;
      if (pricePlan === "friendly1300" || pricePlan === "friendly1600") return 12;
      if (pricePlan === "vip1100") return 20;
      return null;
    }

    function fixedGroupCount(groupPlan) {
      const fixed = {
        groupTrial: 1,
        groupGeneral10: 10,
        term2: 2,
        term2to3: 1,
        term3: 3,
        term4: 4
      };
      return fixed[groupPlan] || null;
    }

    function courseCountOptions(pricePlan) {
      if (pricePlan === "single1800") return [1];
      if (pricePlan === "friendly1300" || pricePlan === "friendly1600") return [12];
      if (pricePlan === "vip1100") return [20];
      if (pricePlan.startsWith("new")) return [8, 16, 24];
      return [10, 20, 30];
    }

    function groupCountOptions(groupPlan) {
      const fixed = fixedGroupCount(groupPlan);
      if (fixed) return [fixed];
      return [1, 2, 3, 4, 8, 10, 12];
    }

    function rechargeCountOptions(type, pricePlan, groupPlan) {
      if (type === "course") return courseCountOptions(pricePlan);
      if (type === "group") return groupCountOptions(groupPlan);
      return [1, 2, 4, 8, 10, 12, 16, 20, 24, 30];
    }

    function coursePeopleLabel(pricePlan) {
      if (pricePlan === "oldRenew1800" || pricePlan === "renew1830" || pricePlan === "friendly1600" || pricePlan === "new1900") return "1v2";
      return "1v1";
    }

    function rechargeTicketLabel(type, planKey = "", quote = {}) {
      if (type === "group") return quote.groupLabel || "團課";
      if (type === "selfTraining") return "自主";
      if (type === "friendlySelfTraining") return "友善自主";
      if (type === "massage") return "按摩";
      const isFriendly = String(planKey).includes("friendly");
      const isPair = coursePeopleLabel(planKey) === "1v2";
      return `${isFriendly ? "友善" : "教練"}${isPair ? "1V2" : "1V1"}`;
    }

    function addTicketBucket(member, { type, label, total, remaining = total, isBonus = false, planKey = "", peoplePlan = "", paymentLabel = "", installmentText = "", unitValue = 0, expiry = "" }) {
      // 每次儲值都建立獨立票券批次，避免不同方案、贈送堂數或分期堂數混在一起。
      if (!member.ticketBuckets) member.ticketBuckets = [];
      if (!total || total <= 0) return null;
      const bucket = {
        id: `bucket-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type,
        label,
        planKey,
        peoplePlan,
        total,
        remaining,
        used: Math.max(0, total - remaining),
        isBonus,
        unitValue,
        paymentLabel,
        installmentText,
        expiry,
        createdAt: todayDateSlash()
      };
      member.ticketBuckets.push(bucket);
      return bucket;
    }

    function syncWalletFromBuckets(member) {
      member.ticketWallet = member.ticketWallet || {};
      member.ticketExpiry = member.ticketExpiry || {};
      member.bonusWallet = member.bonusWallet || { course: 0, group: 0 };
      (member.ticketBuckets || []).forEach(bucket => {
        if (!bucket.id) bucket.id = `bucket-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      });
      const sumType = type => (member.ticketBuckets || [])
        .filter(bucket => bucket.type === type)
        .reduce((sum, bucket) => sum + Math.max(0, bucket.remaining || 0), 0);
      member.ticketWallet.course = sumType("course");
      member.ticketWallet.group = sumType("group");
      member.ticketWallet.selfTraining = sumType("selfTraining");
      member.ticketWallet.friendlySelfTraining = sumType("friendlySelfTraining");
      member.ticketWallet.massage = sumType("massage");
      member.bonusWallet.course = (member.ticketBuckets || [])
        .filter(bucket => bucket.type === "course" && bucket.isBonus)
        .reduce((sum, bucket) => sum + Math.max(0, bucket.remaining || 0), 0);
      member.bonusWallet.group = (member.ticketBuckets || [])
        .filter(bucket => bucket.type === "group" && bucket.isBonus)
        .reduce((sum, bucket) => sum + Math.max(0, bucket.remaining || 0), 0);
      member.tickets = member.ticketWallet.course;
    }

    function availableTicketBuckets(member, type) {
      return (member?.ticketBuckets || []).filter(bucket => bucket.type === type && (bucket.remaining || 0) > 0);
    }

    function consumeMemberTicket(member, type, amount = 1) {
      if (!member) return false;
      let remainingToUse = amount;
      const buckets = type === "course" && ticketConsumePlanOverride
        ? availableTicketBuckets(member, type).filter(bucket => courseBucketMatchesPlan(bucket, ticketConsumePlanOverride))
        : availableTicketBuckets(member, type);
      for (const bucket of buckets) {
        if (remainingToUse <= 0) break;
        const use = Math.min(bucket.remaining || 0, remainingToUse);
        bucket.remaining -= use;
        bucket.used = (bucket.used || 0) + use;
        remainingToUse -= use;
      }
      syncWalletFromBuckets(member);
      return remainingToUse <= 0;
    }

    function restoreMemberTicket(member, type, amount = 1, booking = null, allowFallback = true) {
      if (!member || amount <= 0) return 0;
      syncWalletFromBuckets(member);
      let remainingToRestore = amount;
      let buckets = (member.ticketBuckets || []).filter(bucket => bucket.type === type && (bucket.used || 0) > 0);
      if (type === "course" && booking) {
        const plan = getPlanInfo(sameCourseKey(booking));
        buckets = buckets.filter(bucket => courseBucketMatchesPlan(bucket, plan, false));
      }
      buckets = buckets.slice().reverse();
      for (const bucket of buckets) {
        if (remainingToRestore <= 0) break;
        const room = Math.max(0, (bucket.total || 0) - (bucket.remaining || 0));
        const restore = Math.min(room, bucket.used || 0, remainingToRestore);
        if (restore <= 0) continue;
        bucket.remaining = (bucket.remaining || 0) + restore;
        bucket.used = Math.max(0, (bucket.used || 0) - restore);
        remainingToRestore -= restore;
      }
      if (remainingToRestore > 0 && allowFallback) {
        const label = type === "group"
          ? "團課"
          : type === "friendlySelfTraining"
            ? "友善自主"
            : type === "selfTraining"
              ? "自主"
              : booking ? displayTicketLabel(courseShortTag(booking)) : ticketTypeShortLabel(type);
        addTicketBucket(member, {
          type,
          label,
          total: remainingToRestore,
          remaining: remainingToRestore,
          isBonus: false,
          planKey: booking ? bookingTypeValueFromBooking(booking) : "",
          expiry: type === "selfTraining" || type === "friendlySelfTraining" || type === "group"
            ? member.ticketExpiry?.[type === "group" ? "group" : type] || ""
            : ""
        });
        remainingToRestore = 0;
      }
      syncWalletFromBuckets(member);
      return amount - remainingToRestore;
    }

    function restoreTicketsForBooking(booking) {
      if (!booking || booking.kind === "trial") return 0;
      let restored = 0;
      const memberIds = booking.memberIds || [];
      if (booking.kind === "group") {
        memberIds.forEach(memberId => {
          const member = members.find(item => item.id === memberId);
          restored += restoreMemberTicket(member, "group", 1, booking);
        });
        return restored;
      }
      if (booking.kind === "self") {
        memberIds.forEach(memberId => {
          const member = members.find(item => item.id === memberId);
          const friendlyFirst = friendlySelfTrainingUsable(booking.day, booking.time);
          const primary = friendlyFirst ? "friendlySelfTraining" : "selfTraining";
          const secondary = friendlyFirst ? "selfTraining" : "friendlySelfTraining";
          const restoredPrimary = restoreMemberTicket(member, primary, 1, booking, false);
          restored += restoredPrimary || restoreMemberTicket(member, secondary, 1, booking, true);
        });
        return restored;
      }
      memberIds.forEach(memberId => {
        const member = members.find(item => item.id === memberId);
        restored += restoreMemberTicket(member, "course", 1, booking);
      });
      return restored;
    }

    function rechargeFormMarkup(member) {
      return `
        <div class="recharge-box modal-recharge-box">
          <div class="field">
            <label>會員姓名</label>
            <div class="price-preview">
              <strong>${escapeHtml(member.name)}</strong>
              <span>${escapeHtml(displayPhone(member.phone) || "未填電話")}｜${escapeHtml(normalizeIdentity(member.identity) || "未設定等級")}</span>
            </div>
            <input id="rechargeMemberPicker" type="hidden" value="${escapeHtml(member.name)}">
          </div>
          <div class="field">
            <label for="rechargeType">票券類型</label>
            <select id="rechargeType" aria-label="票券類型">
            <option value="">請選擇票券類型</option>
            <option value="course">教練 / 課程票券</option>
            <option value="selfTraining">自主訓練</option>
            <option value="friendlySelfTraining">友善自主</option>
            <option value="group">團體課票券</option>
            <option value="massage">運動按摩</option>
          </select>
          </div>
          <div class="field" id="pricePlanWrap">
            <label for="rechargePricePlan">細項方案</label>
            <select id="rechargePricePlan">
              ${rechargePriceOptions(member).map(option => `<option value="${option.value}">${option.label}</option>`).join("")}
            </select>
          </div>
          <div class="field hidden" id="groupPlanWrap">
            <label for="groupClassPlan">細項方案</label>
            <select id="groupClassPlan">
              <option value="groupTrial">團課體驗 1 堂 / 600</option>
              <option value="groupGeneral10">一般方案 10 堂 / 5,000</option>
              <option value="term2">期班 2 堂 / 900</option>
              <option value="term2to3">期班 2 堂升 3 堂 / +425</option>
              <option value="term3">期班 3 堂 / 1,275</option>
              <option value="term4">期班 4 堂 / 1,600</option>
              <option value="termExtra">期班加堂，每堂 +400</option>
            </select>
          </div>
          <div class="field">
            <label for="rechargeCount">堂數</label>
            <select id="rechargeCount">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="4">4</option>
              <option value="8">8</option>
              <option value="10">10</option>
              <option value="12">12</option>
              <option value="16">16</option>
              <option value="20">20</option>
              <option value="24">24</option>
              <option value="30">30</option>
            </select>
          </div>
          <div class="field hidden" id="peoplePlanWrap">
            <label for="rechargePeoplePlan">上課人數</label>
            <select id="rechargePeoplePlan">
              <option value="1v1">1 對 1</option>
              <option value="1v2">1 對 2，每堂 +300</option>
            </select>
          </div>
          <div class="price-preview" id="rechargePricePreview">選擇票券後會顯示價格。</div>
          <div class="price-preview ${memberStoreCreditAmount(member) > 0 ? "" : "hidden"}" id="storeCreditBox">
            <label style="display:flex; align-items:center; gap:8px; font-weight:900;">
              <input id="useStoreCredit" type="checkbox" checked>
              使用會員儲值金
            </label>
            <span>目前儲值金：${money(memberStoreCreditAmount(member))}</span>
            <span id="storeCreditApplyText">選擇票券後會計算折抵金額。</span>
          </div>
          <div class="payment-grid">
            <div class="field">
              <label for="paymentMode">付款期數</label>
              <select id="paymentMode">
                <option value="full">一次付清</option>
                <option value="installment3">分期</option>
              </select>
            </div>
            <div class="field">
              <label for="installmentNumber">本次期數</label>
              <select id="installmentNumber" disabled>
                <option value="1">第 1 期</option>
                <option value="2">第 2 期</option>
                <option value="3">第 3 期</option>
              </select>
            </div>
            <div class="field">
              <label for="installmentSessions">本次開放堂數</label>
              <select id="installmentSessions"></select>
            </div>
            <div class="field">
              <label for="paymentReceived">本次收款金額</label>
              <input id="paymentReceived" type="number" min="0" step="1" value="0">
            </div>
            <div class="field">
              <label for="paymentMethod">收款方式</label>
              <select id="paymentMethod">
                <option value="cash">現金</option>
                <option value="transfer">匯款</option>
              </select>
            </div>
          </div>
          <div class="transfer-info hidden" id="transferInfo">
            <strong>匯款資訊</strong>
            <span>銀行：請設定銀行名稱</span>
            <span>帳號：請設定匯款帳號</span>
            <span>戶名：YUGYM Training 有肌訓練</span>
            <span>備註請填：會員姓名 + 課程方案</span>
          </div>
          <div class="field recharge-expiry hidden" id="rechargeExpiryWrap">
            <label for="rechargeExpiry">有效期</label>
            <input id="rechargeExpiry" type="date" value="2026-06-30">
          </div>
          <div class="modal-actions">
            <button class="secondary-btn" type="button" id="cancelRechargeBtn">取消</button>
            <button class="primary-btn" type="button" id="rechargeTicketBtn">確認儲值</button>
          </div>
        </div>
      `;
    }

    function setCountOptions(select, options) {
      const current = Number(select.value);
      select.innerHTML = options.map(value => `<option value="${value}">${value}</option>`).join("");
      select.value = options.includes(current) ? String(current) : String(options[0]);
    }

    function getGroupClassQuote(groupPlan, count) {
      const plans = {
        groupTrial: { sessions: 1, price: 600, label: "團課體驗", note: "體驗課 1 堂 / 600" },
        groupGeneral10: { sessions: 10, price: 5000, label: "一般方案", note: "一般方案 10 堂 / 5,000，單堂 500" },
        term2: { sessions: 2, price: 900, label: "期班 2 堂", note: "期班 2 堂 / 900，單堂 450，原則有效期 6 週" },
        term2to3: { sessions: 1, price: 425, label: "期班 2 堂升 3 堂", note: "期班 2 堂加 1 堂升級為 3 堂，升級費 +425，原則有效期 6 週" },
        term3: { sessions: 3, price: 1275, label: "期班 3 堂", note: "期班 3 堂 / 1,275，單堂 425，原則有效期 6 週" },
        term4: { sessions: 4, price: 1600, label: "期班 4 堂", note: "期班 4 堂 / 1,600，單堂 400，原則有效期 6 週" }
      };

      if (groupPlan === "termExtra") {
        return {
          valid: true,
          gift: 0,
          paidSessions: count,
          totalSessions: count,
          unit: 400,
          price: count * 400,
          priceText: money(count * 400),
          message: `期班加堂 ${count} 堂，每堂 ${money(400)}，共 ${money(count * 400)}。原則有效期 6 週。`,
          groupLabel: "期班加堂",
          termExpiry: true
        };
      }

      const plan = plans[groupPlan] || plans.groupTrial;
      return {
        valid: true,
        gift: 0,
        paidSessions: plan.sessions,
        totalSessions: plan.sessions,
        unit: plan.price / plan.sessions,
        price: plan.price,
        priceText: money(plan.price),
        message: `${plan.note}。入帳 ${plan.sessions} 堂。`,
        groupLabel: plan.label,
        termExpiry: groupPlan.startsWith("term")
      };
    }

    function openRechargeDialogForMember(member, shortcut = "", paymentShortcut = null) {
      if (!member) return;
      rechargeModalTitle.textContent = shortcut === "group" ? "儲值團課票券" : "儲值續約票券";
      rechargeModalSubtitle.textContent = `${member.name}｜${displayPhone(member.phone)}`;
      rechargeModalContent.innerHTML = rechargeFormMarkup(member);
      rechargeModal.classList.add("open");
      rechargeModal.setAttribute("aria-hidden", "false");
      bindRechargeControls(shortcut, paymentShortcut);
    }

    function openRechargeDialog(shortcut = "", paymentShortcut = null) {
      const member = getProfileMember();
      if (!member) {
        openRechargeMemberPickerDialog();
        return;
      }
      openRechargeDialogForMember(member, shortcut, paymentShortcut);
    }

    function openRechargeMemberPickerDialog() {
      rechargeModalTitle.textContent = "選擇會員儲值票券";
      rechargeModalSubtitle.textContent = "先輸入會員姓名，再進入儲值流程。";
      rechargeModalContent.innerHTML = `
        <div class="recharge-box modal-recharge-box">
          <div class="field">
            <label for="topRechargeMemberSearch">會員姓名</label>
            <div class="search-field">
              <input id="topRechargeMemberSearch" placeholder="輸入姓名搜尋會員" autocomplete="off">
              <div class="suggestions hidden" id="topRechargeMemberSuggestions"></div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="secondary-btn" type="button" id="cancelTopRechargePicker">取消</button>
          </div>
        </div>
      `;
      rechargeModal.classList.add("open");
      rechargeModal.setAttribute("aria-hidden", "false");
      const input = document.querySelector("#topRechargeMemberSearch");
      const suggestions = document.querySelector("#topRechargeMemberSuggestions");
      const openSelectedMemberRecharge = member => {
        profileMemberId = member.id;
        memberProfileSelect.value = bookingMemberOptionLabel(member);
        renderMemberProfile();
        openRechargeDialogForMember(member, "");
      };
      input?.addEventListener("input", () => {
        renderMemberSuggestionList(input, suggestions, openSelectedMemberRecharge, () => true);
      });
      input?.addEventListener("focus", () => suggestions?.classList.add("hidden"));
      document.querySelector("#cancelTopRechargePicker")?.addEventListener("click", closeRechargeModalDialog);
      setTimeout(() => input?.focus(), 0);
    }

    function bindRechargeLaunchControls() {
      document.querySelectorAll("[data-open-recharge]").forEach(button => {
        button.addEventListener("click", async () => openRechargeDialog(""));
      });
      document.querySelector("#quickPaymentBtn")?.addEventListener("click", async () => {
        const shortcut = getActivePaymentShortcut(getProfileMember());
        if (!shortcut) return;
        openRechargeDialog(shortcut.type === "group" ? "group" : "renew", shortcut);
      });
    }

    function bindRechargeControls(initialShortcut = "", paymentShortcut = null) {
      const rechargeMemberPicker = document.querySelector("#rechargeMemberPicker");
      const typeSelect = document.querySelector("#rechargeType");
      const countSelect = document.querySelector("#rechargeCount");
      const pricePlanWrap = document.querySelector("#pricePlanWrap");
      const pricePlanSelect = document.querySelector("#rechargePricePlan");
      const groupPlanWrap = document.querySelector("#groupPlanWrap");
      const groupPlanSelect = document.querySelector("#groupClassPlan");
      const peoplePlanWrap = document.querySelector("#peoplePlanWrap");
      const peoplePlanSelect = document.querySelector("#rechargePeoplePlan");
      const pricePreview = document.querySelector("#rechargePricePreview");
      const useStoreCredit = document.querySelector("#useStoreCredit");
      const storeCreditApplyText = document.querySelector("#storeCreditApplyText");
      const storeCreditBox = document.querySelector("#storeCreditBox");
      const paymentMode = document.querySelector("#paymentMode");
      const installmentNumber = document.querySelector("#installmentNumber");
      const installmentSessions = document.querySelector("#installmentSessions");
      const paymentReceived = document.querySelector("#paymentReceived");
      const paymentMethod = document.querySelector("#paymentMethod");
      const transferInfo = document.querySelector("#transferInfo");
      const expiryWrap = document.querySelector("#rechargeExpiryWrap");
      const expiryInput = document.querySelector("#rechargeExpiry");
      const rechargeButton = document.querySelector("#rechargeTicketBtn");
      if (!rechargeMemberPicker || !typeSelect || !countSelect || !pricePlanWrap || !pricePlanSelect || !groupPlanWrap || !groupPlanSelect || !peoplePlanWrap || !peoplePlanSelect || !pricePreview || !useStoreCredit || !storeCreditApplyText || !storeCreditBox || !paymentMode || !installmentNumber || !installmentSessions || !paymentReceived || !paymentMethod || !transferInfo || !expiryWrap || !expiryInput || !rechargeButton) return;

      const showRechargeNotice = text => {
        memberRechargeNotice = text;
        const notice = document.querySelector("#memberRechargeNotice");
        if (notice) {
          notice.innerHTML = text;
          notice.classList.toggle("hidden", !text);
        }
      };

      const syncPaymentMethod = () => {
        transferInfo.classList.toggle("hidden", paymentMethod.value !== "transfer");
      };

      const syncStoreCreditPreview = () => {
        const member = getProfileMember();
        const dueAmount = Math.max(0, Number(paymentReceived.value) || 0);
        const availableCredit = memberStoreCreditAmount(member);
        storeCreditBox.classList.toggle("hidden", availableCredit <= 0);
        const creditUsed = useStoreCredit.checked ? Math.min(availableCredit, dueAmount) : 0;
        const finalPay = Math.max(0, dueAmount - creditUsed);
        storeCreditApplyText.textContent = useStoreCredit.checked
          ? `本次折抵 ${money(creditUsed)}，還需要補差額 ${money(finalPay)}。`
          : `本次不使用儲值金，需收款 ${money(dueAmount)}。`;
        return { dueAmount, availableCredit, creditUsed, finalPay };
      };

      const availableInstallmentParts = (type, count, pricePlan, quote) => {
        if (quote.price <= 0 || type !== "course") return [];
        if (type === "course" && pricePlan.startsWith("new") && [8, 16].includes(count)) return [2];
        if (type === "course" && count >= 20) return [2, 3];
        return [3];
      };

      const currentPlanKey = () => typeSelect.value === "group" ? groupPlanSelect.value : pricePlanSelect.value;

      const selectedShortcut = () => {
        if (typeSelect.value === "group") return "group";
        return "renew";
      };

      const applyRechargeShortcut = shortcut => {
        if (shortcut === "group") {
          typeSelect.value = "group";
          groupPlanSelect.value = "groupGeneral10";
        } else {
          typeSelect.value = "course";
          const options = [...pricePlanSelect.options].map(option => option.value);
          if (options.includes("oldRenew1500")) {
            pricePlanSelect.value = "oldRenew1500";
          } else if (options.includes("vip1100")) {
            pricePlanSelect.value = "vip1100";
          } else if (options.includes("renew1530")) {
            pricePlanSelect.value = "renew1530";
          } else {
            pricePlanSelect.value = options[0];
          }
        }
        syncRecharge();
      };

      const nextInstallmentNumber = (member, type, planKey, planSessions, parts) => {
        const paidCount = member.rechargeHistory.filter(record =>
          record.type === type &&
          record.planKey === planKey &&
          record.planSessions === planSessions &&
          record.paymentLabel === `分 ${parts} 期`
        ).length;
        return (paidCount % parts) + 1;
      };

      const syncPaymentOptions = (partsOptions) => {
        const currentMode = paymentMode.value;
        paymentMode.innerHTML = [
          `<option value="full">一次付清</option>`,
          ...partsOptions.map(parts => `<option value="installment${parts}">分 ${parts} 期</option>`)
        ].join("");
        paymentMode.value = [...paymentMode.options].some(option => option.value === currentMode) ? currentMode : "full";
      };

      const syncRecharge = () => {
        if (!typeSelect.value) {
          pricePlanWrap.classList.add("hidden");
          groupPlanWrap.classList.add("hidden");
          peoplePlanWrap.classList.add("hidden");
          expiryWrap.classList.add("hidden");
          paymentMode.disabled = true;
          installmentNumber.disabled = true;
          installmentSessions.disabled = true;
          paymentReceived.value = "";
          pricePreview.innerHTML = "請先選擇票券類型。";
          syncStoreCreditPreview();
          rechargeButton.disabled = true;
          return;
        }
        const isCourse = typeSelect.value === "course";
        const isGroup = typeSelect.value === "group";
        const countOptions = rechargeCountOptions(typeSelect.value, pricePlanSelect.value, groupPlanSelect.value);
        setCountOptions(countSelect, countOptions);
        countSelect.disabled = countOptions.length === 1;
        const count = Number(countSelect.value);
        const quote = getRechargeQuote(typeSelect.value, count, pricePlanSelect.value, peoplePlanSelect.value);
        pricePlanWrap.classList.toggle("hidden", !isCourse);
        groupPlanWrap.classList.toggle("hidden", !isGroup);
        peoplePlanWrap.classList.add("hidden");
        pricePlanSelect.disabled = !isCourse;
        groupPlanSelect.disabled = !isGroup;
        peoplePlanSelect.value = isCourse ? coursePeopleLabel(pricePlanSelect.value) : "1v1";
        peoplePlanSelect.disabled = true;
        expiryWrap.classList.toggle("hidden", !needsExpiry(typeSelect.value));
        if (typeSelect.value === "group" && quote.termExpiry) expiryInput.value = "2026-07-03";
        const partsOptions = availableInstallmentParts(typeSelect.value, count, pricePlanSelect.value, quote);
        syncPaymentOptions(partsOptions);
        const canInstallment = partsOptions.length > 0;
        paymentMode.disabled = !canInstallment;
        const installmentPartsCount = paymentMode.value.startsWith("installment")
          ? Number(paymentMode.value.replace("installment", ""))
          : 0;
        const isInstallment = installmentPartsCount > 0 && canInstallment;
        const numberOptionCount = isInstallment ? installmentPartsCount : (partsOptions[0] || 3);
        installmentNumber.innerHTML = Array.from({ length: numberOptionCount }, (_, index) => `<option value="${index + 1}">第 ${index + 1} 期</option>`).join("");
        const member = getProfileMember();
        installmentNumber.value = isInstallment
          ? String(nextInstallmentNumber(member, typeSelect.value, currentPlanKey(), quote.paidSessions || quote.totalSessions, installmentPartsCount))
          : "1";
        const part = Number(installmentNumber.value) || 1;
        installmentNumber.disabled = true;
        const currentSessions = isInstallment ? installmentPartValue(quote.paidSessions || quote.totalSessions, part, installmentPartsCount) : (quote.paidSessions || quote.totalSessions);
        installmentSessions.innerHTML = `<option value="${currentSessions}">${currentSessions} 堂</option>`;
        installmentSessions.value = String(currentSessions);
        installmentSessions.disabled = true;
        paymentReceived.value = isInstallment ? installmentAmountValue(quote, currentSessions) : quote.price;
        const giftSeparateText = quote.gift ? `贈送 ${quote.gift} 堂會在${isInstallment ? "最後一期" : "本次"}另存為贈送票券。` : "";
        pricePreview.innerHTML = isInstallment
          ? `
            <strong>${quote.message}</strong>
            <span>付款方式：分期，自動判斷第 ${part} 期。</span>
            <span>本次開放：${installmentSessions.value} 堂。</span>
            <span>本次收款：${money(Number(paymentReceived.value))}。</span>
            ${giftSeparateText ? `<span>${giftSeparateText}</span>` : ""}
          `
          : `
            <strong>${quote.message}</strong>
            <span>付款方式：一次付清。</span>
            ${giftSeparateText ? `<span>${giftSeparateText}</span>` : ""}
          `;
        pricePreview.insertAdjacentHTML("beforeend", isInstallment
          ? `<span class="installment-status">目前付款：第 ${part} / ${installmentPartsCount} 期，本期開放 ${installmentSessions.value} 堂，應收 ${money(Number(paymentReceived.value))}</span>`
          : `<span class="installment-status">目前付款：一次付清，應收 ${money(Number(paymentReceived.value))}</span>`);
        rechargeButton.textContent = isInstallment
          ? `確認儲值（第 ${part}/${installmentPartsCount} 期）`
          : "確認儲值";
        syncStoreCreditPreview();
        rechargeButton.disabled = !quote.valid;
      };

      typeSelect.addEventListener("change", syncRecharge);
      countSelect.addEventListener("change", syncRecharge);
      pricePlanSelect.addEventListener("change", syncRecharge);
      groupPlanSelect.addEventListener("change", syncRecharge);
      peoplePlanSelect.addEventListener("change", syncRecharge);
      paymentMode.addEventListener("change", syncRecharge);
      paymentMethod.addEventListener("change", syncPaymentMethod);
      useStoreCredit.addEventListener("change", syncStoreCreditPreview);
      paymentReceived.addEventListener("input", syncStoreCreditPreview);
      installmentNumber.addEventListener("change", syncRecharge);
      document.querySelector("#cancelRechargeBtn")?.addEventListener("click", closeRechargeModalDialog);
      rechargeButton.addEventListener("click", async () => {
        const member = getProfileMember();
        const type = typeSelect.value;
        const count = Number(countSelect.value);
        const quote = getRechargeQuote(type, count, pricePlanSelect.value, peoplePlanSelect.value);
        if (!quote.valid) return;
        const installmentPartsCount = paymentMode.value.startsWith("installment")
          ? Number(paymentMode.value.replace("installment", ""))
          : 0;
        const isInstallment = installmentPartsCount > 0 && quote.price > 0 && type === "course";
        const planKey = type === "group" ? groupPlanSelect.value : pricePlanSelect.value;
        if (isInstallment) {
          installmentNumber.value = String(nextInstallmentNumber(member, type, planKey, quote.paidSessions || quote.totalSessions, installmentPartsCount));
        }
        const unlockedSessions = isInstallment
          ? Math.min(quote.paidSessions || quote.totalSessions, Math.max(0, Number(installmentSessions.value) || 0))
          : (quote.paidSessions || quote.totalSessions);
        const currentPart = Number(installmentNumber.value) || 1;
        const isFinalInstallment = isInstallment && currentPart === installmentPartsCount;
        const bonusGift = (!isInstallment || isFinalInstallment) ? quote.gift || 0 : 0;
        if (quote.totalSessions > 0 && unlockedSessions <= 0) {
          formMessage.className = "message error";
          formMessage.textContent = "本次開放堂數需要大於 0，才會加入會員票券。";
          return;
        }
        const creditResult = syncStoreCreditPreview();
        const collectedAmount = creditResult.finalPay;
        const storeCreditUsed = creditResult.creditUsed;
        const paymentMethodLabel = paymentMethod.value === "transfer" ? "匯款" : "現金";
        const installmentText = isInstallment ? `第 ${installmentNumber.value} 期` : "";
        const regularLabel = rechargeTicketLabel(type, planKey, quote);
        if (!(await confirmChange([
          "確認儲值收款",
          `會員：${member.name}`,
          `票券：${regularLabel}`,
          `入帳堂數：${unlockedSessions}${bonusGift > 0 ? ` + 贈送 ${bonusGift}` : ""} 堂`,
          `原本應收：${money(creditResult.dueAmount)}`,
          `儲值金折抵：${money(storeCreditUsed)}`,
          `【本次實收】${money(collectedAmount)}`,
          `收款方式：${paymentMethodLabel}`
        ].join("\n")))) return;
        if (storeCreditUsed > 0) {
          member.storeCredit = Math.max(0, memberStoreCreditAmount(member) - storeCreditUsed);
        }
        addTicketBucket(member, {
          type,
          label: regularLabel,
          total: unlockedSessions,
          remaining: unlockedSessions,
          isBonus: false,
          planKey,
          peoplePlan: type === "course" ? coursePeopleLabel(pricePlanSelect.value) : "",
          paymentLabel: isInstallment ? `分 ${installmentPartsCount} 期` : "不分期",
          installmentText,
          unitValue: quote.unit || 0,
          expiry: needsExpiry(type) ? (expiryInput.value ? expiryInput.value.replaceAll("-", "/") : "") : ""
        });
        if (bonusGift > 0) {
          addTicketBucket(member, {
            type,
            label: type === "course" ? "贈送課" : "贈送團課",
            total: bonusGift,
            remaining: bonusGift,
            isBonus: true,
            planKey,
            peoplePlan: type === "course" ? coursePeopleLabel(pricePlanSelect.value) : "",
            paymentLabel: isInstallment ? `分 ${installmentPartsCount} 期` : "不分期",
            installmentText: isInstallment ? `第 ${installmentNumber.value} 期贈送` : "贈送",
            unitValue: 0,
            expiry: needsExpiry(type) ? (expiryInput.value ? expiryInput.value.replaceAll("-", "/") : "") : ""
          });
        }
        syncWalletFromBuckets(member);

        if (type === "course") {
          member.tickets = member.ticketWallet.course;
          member.status = member.tickets === 1 ? "續約" : member.tickets <= 2 ? "低堂數" : "正常";
        }

        if (needsExpiry(type)) {
          member.ticketExpiry[type] = expiryInput.value ? expiryInput.value.replaceAll("-", "/") : "";
        }

        member.rechargeHistory.unshift({
          date: "2026/05/22",
          type,
          planKey,
          typeLabel: type === "group" && quote.groupLabel ? quote.groupLabel : ticketTypeLabel(type),
          count: unlockedSessions,
          planSessions: quote.paidSessions || quote.totalSessions,
          unlockedSessions,
          peoplePlan: type === "course" ? coursePeopleLabel(pricePlanSelect.value) : "",
          gift: bonusGift,
          bonusGift,
          unit: quote.unit,
          price: quote.price,
          paymentParts: installmentPartsCount || 1,
          priceText: quote.priceText,
          paymentLabel: isInstallment ? `分 ${installmentPartsCount} 期` : "不分期",
          installmentText,
          collectedAmountText: money(collectedAmount),
          originalDueAmountText: money(creditResult.dueAmount),
          storeCreditUsedText: money(storeCreditUsed),
          paymentMethod: paymentMethodLabel,
          collector: "未指定",
          expiry: needsExpiry(type) ? member.ticketExpiry[type] : ""
        });

        const giftText = bonusGift > 0 ? `，贈送 ${bonusGift} 堂已另存為贈送票券` : "";
        memberRechargeNotice = `
          <p><strong>儲值完成：</strong>${ticketTypeLabel(type)}</p>
          <p><strong>一般票券：</strong>+${unlockedSessions} 堂${giftText}</p>
          <p><strong>儲值金折抵：</strong>${money(storeCreditUsed)}</p>
          <p><strong>本次補差額：</strong>${money(collectedAmount)}</p>
          <p><strong>收款方式：</strong>${paymentMethodLabel}</p>
        `;
        saveAppData();
        closeRechargeModalDialog();
        renderMemberSelect();
        renderBookingTypeOptions();
        renderProfileSelect();
        renderMemberProfile();
        updatePreview();
        formMessage.className = "message";
        formMessage.textContent = `已幫 ${member.name} 儲值 ${ticketTypeLabel(type)}，一般票券 +${unlockedSessions} 堂。`;
      });

      if (initialShortcut) {
        applyRechargeShortcut(initialShortcut);
      } else {
        typeSelect.value = "";
        syncRecharge();
      }
      syncPaymentMethod();
      syncStoreCreditPreview();
      if (paymentShortcut) {
        typeSelect.value = paymentShortcut.type;
        if (paymentShortcut.type === "group") groupPlanSelect.value = paymentShortcut.planKey;
        else pricePlanSelect.value = paymentShortcut.planKey;
        setCountOptions(countSelect, rechargeCountOptions(paymentShortcut.type, pricePlanSelect.value, groupPlanSelect.value));
        if ([...countSelect.options].some(option => Number(option.value) === paymentShortcut.planSessions)) {
          countSelect.value = String(paymentShortcut.planSessions);
        }
        syncRecharge();
        if ([...paymentMode.options].some(option => option.value === paymentShortcut.paymentMode)) {
          paymentMode.value = paymentShortcut.paymentMode;
        }
        peoplePlanSelect.value = paymentShortcut.type === "course" ? coursePeopleLabel(pricePlanSelect.value) : "1v1";
        syncRecharge();
        showRechargeNotice(`已帶入下一期付款：第 ${paymentShortcut.nextPart} 期，開放 ${paymentShortcut.nextSessions} 堂，應收 ${money(paymentShortcut.nextAmount)}。`);
      }
    }

    function getMemberEvents(memberId) {
      return bookings
        .filter(event => event.status !== "cancelled" && eventHasMember(event, memberId))
        .sort((a, b) => getBookingDayNumber(a) - getBookingDayNumber(b) || a.time.localeCompare(b.time));
    }

    function bookingWalletKey(event) {
      if (event.kind === "group") return "group";
      if (event.kind === "self") return "selfTraining";
      return "course";
    }

    function sameCourseKey(event) {
      return bookingTypeValueFromBooking(event);
    }

    function getSameCourseEvents(memberId, event) {
      const key = sameCourseKey(event);
      return getMemberEvents(memberId).filter(item => sameCourseKey(item) === key);
    }

    function remainingForEventCourse(member, event) {
      if (!member) return 0;
      syncWalletFromBuckets(member);
      if (event.kind === "trial") return 0;
      if (event.kind === "group") return member.ticketWallet.group || 0;
      if (event.kind === "self") return availableSelfTrainingTickets(member, event.day, event.time);
      const plan = getPlanInfo(sameCourseKey(event));
      return (member.ticketBuckets || [])
        .filter(bucket => courseBucketMatchesPlan(bucket, plan))
        .reduce((sum, bucket) => sum + Math.max(0, bucket.remaining || 0), 0);
    }

    function memberBookingProgressNumbers(member, event) {
      if (!member) return { index: 0, total: 0 };
      const sameTicketEvents = getSameCourseEvents(member.id, event);
      const index = sameTicketEvents.findIndex(item => item.id === event.id) + 1;
      if (index <= 0) return { index: 0, total: 0 };
      const remaining = remainingForEventCourse(member, event);
      const total = Math.max(index, sameTicketEvents.length + remaining);
      return { index, total };
    }

    function formatMemberBookingProgress(member, event) {
      const { index, total } = memberBookingProgressNumbers(member, event);
      if (index <= 0) return "未列入堂數";
      const renewText = index === total ? "｜續約" : "";
      return `第 ${index}/${total} 堂${renewText}`;
    }

    function formatCalendarBookingProgress(event) {
      if (!event.memberIds || event.memberIds.length === 0) return "";
      const progressItems = event.memberIds
        .map(id => {
          const member = members.find(item => item.id === id);
          if (!member) return "";
          return formatMemberBookingProgress(member, event);
        })
        .filter(Boolean);
      if (!progressItems.length) return "";
      const needsRenew = progressItems.some(item => item.includes("續約"));
      const cleanProgress = progressItems.map(item => item.replace("｜續約", "")).join("、");
      return `堂數：${cleanProgress}`;
    }

    function eventNeedsRenew(event) {
      if (!event.memberIds || event.memberIds.length === 0) return false;
      if (event.kind === "trial") return false;
      if (event.kind === "self") return false;
      return event.memberIds.some(id => {
        const member = members.find(item => item.id === id);
        if (!member) return false;
        const { index, total } = memberBookingProgressNumbers(member, event);
        return index > 0 && total > 0 && index === total && remainingForEventCourse(member, event) <= 0;
      });
    }

    function paymentShortcutMatchesEvent(shortcut, event) {
      if (!shortcut || !event) return false;
      if (event.kind === "group") return shortcut.type === "group";
      if (!["coaching", "friendly"].includes(event.kind)) return false;
      if (shortcut.type !== "course") return false;
      const key = String(shortcut.planKey || "").toLowerCase();
      const label = String(shortcut.label || "").toLowerCase();
      const isFriendlyPlan = key.includes("friendly") || label.includes("friendly") || label.includes("友善");
      const isPairPlan = key.includes("1800") || key.includes("1830") || key.includes("1600") || key.includes("1900") || label.includes("1v2") || label.includes("1 撠?2");
      const isPairEvent = event.people >= 2 || String(event.title || "").toLowerCase().includes("1v2");
      return isFriendlyPlan === (event.kind === "friendly") && isPairPlan === isPairEvent;
    }

    function eventHasInstallment(event) {
      if (!event.memberIds || event.memberIds.length === 0) return false;
      if (event.kind === "trial") return false;
      return event.memberIds.some(id => {
        const member = members.find(item => item.id === id);
        return member
          ? paymentShortcutMatchesEvent(getActivePaymentShortcut(member), event) && isFinalBookingProgress(member, event)
          : false;
      });
    }

    function eventIsCheckedIn(event) {
      if (!event.memberIds || event.memberIds.length === 0) return false;
      return Boolean(event.checkedIn) || event.memberIds.every(id => event.checkIns?.includes(id));
    }

    function eventHasAnyCheckIn(event) {
      return Boolean(event.checkedIn) || Boolean(event.checkIns?.length);
    }

    function calendarCheckInStamp(event) {
      if (!eventHasAnyCheckIn(event)) return "";
      const partial = !eventIsCheckedIn(event);
      return `<div class="checkin-stamp ${partial ? "partial" : ""}">${partial ? "部分簽到" : "已簽到"}</div>`;
    }

    function calendarEventTags(event) {
      const needsRenew = eventNeedsRenew(event);
      const hasInstallment = !needsRenew && eventHasInstallment(event);
      return [
        hasInstallment ? `<span class="installment-chip" title="分期" aria-label="分期">分期</span>` : ""
      ].filter(Boolean).join("");
    }

    function calendarRenewTag(event) {
      if (!eventNeedsRenew(event)) return "";
      return `<div class="event-renew-corner"><span class="renew-chip" title="續約" aria-label="續約">續約</span></div>`;
    }

    function calendarEventTags(event) {
      const needsRenew = eventNeedsRenew(event);
      const hasInstallment = !needsRenew && eventHasInstallment(event);
      return [
        hasInstallment ? `<span class="installment-chip" title="分期" aria-label="分期">分</span>` : ""
      ].filter(Boolean).join("");
    }

    function calendarRenewTag(event) {
      if (!eventNeedsRenew(event)) return "";
      return `<div class="event-renew-corner"><span class="renew-chip" title="續約" aria-label="續約">續</span></div>`;
    }

    function calendarEventTags(event) {
      return "";
    }

    function calendarRenewTag(event) {
      if (eventHasInstallment(event)) {
        return `<div class="event-renew-corner"><span class="installment-chip" title="分期" aria-label="分期">分</span></div>`;
      }
      if (!eventNeedsRenew(event)) return "";
      return `<div class="event-renew-corner"><span class="renew-chip" title="續約" aria-label="續約">續</span></div>`;
    }

    function bookingCoachName(event) {
      if (event?.kind === "self") return "-";
      const detail = String(event.detail || "");
      const afterSlash = detail.includes("/") ? detail.split("/").pop() : detail;
      const cleaned = afterSlash.split(/[，,｜]/)[0].trim();
      if (cleaned && !cleaned.includes("人") && !cleaned.includes("訓練")) return cleaned;
      const match = detail.match(/Coach\s+[A-Za-z]+|Randy|Sandy|Mango|Barry|Zoe|不指定|未指定教練/);
      return match ? match[0] : "-";
    }

    function normalizeCoachName(coach) {
      const value = String(coach || "").trim();
      return value && value !== "-" && value !== "不指定" ? value : "";
    }

    function bookingCoachConflict(dayKey, time, weekOffset = 0, coach = "", excludeBookingId = "") {
      const targetCoach = normalizeCoachName(coach);
      if (!targetCoach) return null;
      const conflicts = bookingWindowCapacities(dayKey, time, weekOffset, excludeBookingId)
        .flatMap(item => item.cap.events)
        .filter((event, index, list) => list.findIndex(item => item.id === event.id) === index)
        .find(event => normalizeCoachName(bookingCoachName(event)) === targetCoach);
      return conflicts || null;
    }

    function coachConflictMessage(conflict, coach = "") {
      const targetCoach = normalizeCoachName(coach) || bookingCoachName(conflict);
      return `${targetCoach} 在 ${formatBookingDate(conflict)} ${conflict.time} 已有 ${bookingMemberNames(conflict)} 的預約，同一個時段不能重複預約。`;
    }

    function bookingBaseLabel(booking) {
      return (booking.detail || "").split("，")[0].split(" / ")[0] || booking.title;
    }

    function setBookingCoach(booking, coach) {
      const memberNames = bookingMemberNames(booking);
      if (booking.kind === "group") {
        booking.detail = `${bookingBaseLabel(booking)} / ${coach}，${memberNames}，${booking.memberIds.length}/5 人`;
      } else {
        booking.detail = `${memberNames} / ${coach}`;
      }
    }

    function renderGroupMemberProgress(booking) {
      if (booking.kind !== "group") {
        groupMemberProgress.classList.add("hidden");
        groupMemberProgress.innerHTML = "";
        return;
      }
      groupMemberProgress.classList.remove("hidden");
      const rows = booking.memberIds.length
        ? booking.memberIds.map(id => {
            const member = members.find(item => item.id === id);
            if (!member) return "";
            const checked = booking.checkIns?.includes(id);
            const needsRenew = isFinalBookingProgress(member, booking);
            const checkInState = checkInAvailability(booking);
            const checkInDisabled = checked || booking.status === "cancelled" || !checkInState.ok;
            return `
              <li class="attendance-row">
                <span>
                  <span class="attendance-name">
                    <strong>${member.name}</strong>
                    ${needsRenew ? `<span class="renew-dot" title="續約" aria-label="續約"></span>` : ""}
                  </span>
                  <span>${formatMemberBookingProgress(member, booking).replace("｜續約", "")}</span>
                </span>
                <button class="secondary-btn" type="button" data-group-checkin="${booking.id}" data-member-id="${member.id}" title="${escapeHtml(checkInState.message || "")}" ${checkInDisabled ? "disabled" : ""}>${checked ? "已簽到" : isPastBooking(booking) ? "補簽" : "簽到"}</button>
              </li>
            `;
          }).filter(Boolean).join("")
        : `<li>尚未加入學員</li>`;
      const canAddMember = !isPastBooking(booking) && booking.status !== "cancelled" && booking.memberIds.length < 5;
      groupMemberProgress.innerHTML = `
        <div class="history-title attendance-title">
          <span>團課出席名單</span>
          <button class="icon-action-btn attendance-add-btn" type="button" data-open-group-member-modal title="加入團課學員" aria-label="加入團課學員" ${canAddMember ? "" : "disabled"}>＋</button>
        </div>
        <ul class="history-list">${rows}</ul>
      `;
      groupMemberProgress.querySelector("[data-open-group-member-modal]")?.addEventListener("click", openGroupMemberDialog);
      groupMemberProgress.querySelectorAll("[data-group-checkin]").forEach(button => {
        button.addEventListener("click", async () => checkInBooking(button.dataset.groupCheckin, button.dataset.memberId));
      });
    }

    function courseShortTag(event) {
      const peopleSuffix = event.people >= 2 || event.title.includes("1v2") ? "1V2" : "1V1";
      if (event.kind === "trial") return "體驗";
      if (event.kind === "friendly") return `友善${peopleSuffix}`;
      if (event.kind === "coaching") return `教練${peopleSuffix}`;
      if (event.kind === "group") return "小班";
      if (event.kind === "self") return "自主";
      return event.title;
    }

    function compactProgressText(member, event) {
      const match = formatMemberBookingProgress(member, event).match(/\d+\s*\/\s*\d+/);
      return match ? match[0].replace(/\s+/g, "") : "";
    }

    function isFinalBookingProgress(member, event) {
      const progress = compactProgressText(member, event);
      const match = progress.match(/^(\d+)\/(\d+)$/);
      if (!match) return false;
      const current = Number(match[1]);
      const total = Number(match[2]);
      return current > 0 && total > 0 && current === total;
    }

    function calendarMemberLine(event) {
      if (!event.memberIds || event.memberIds.length === 0) return "未指定會員";
      return event.memberIds.map(id => {
        const member = members.find(item => item.id === id);
        if (!member) return "";
        if (event.kind === "group" || event.kind === "trial") return member.name;
        const progress = compactProgressText(member, event);
        return progress ? `${member.name}(${progress})` : member.name;
      }).filter(Boolean).join("、") || "未指定會員";
    }

    function calendarEventLines(event) {
      return {
        tag: courseShortTag(event),
        member: calendarMemberLine(event),
        coach: bookingCoachName(event),
        progress: event.kind === "group" ? "" : formatCalendarBookingProgress(event)
      };
    }

    function getDayNumber(dayKey, weekOffset = 0) {
      const dayMap = { mon: 18, tue: 19, wed: 20, thu: 21, fri: 22, sat: 23, sun: 24 };
      return dayMap[dayKey] + (7 * weekOffset);
    }

    function dateForDay(dayKey, weekOffset = 0) {
      const date = new Date(2026, 4, getDayNumber(dayKey, weekOffset));
      return date;
    }

    function shortDateLabel(dayKey, weekOffset = 0) {
      const date = dateForDay(dayKey, weekOffset);
      return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    }

    function fullDateLabel(dayKey, weekOffset = 0) {
      const date = dateForDay(dayKey, weekOffset);
      return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    }

    function currentBaseDayIndex() {
      return positiveModulo(currentCalendarOffset(), days.length);
    }

    function currentCalendarOffset() {
      return currentCalendarDayNumber() - 18;
    }

    function positiveModulo(value, base) {
      return ((value % base) + base) % base;
    }

    function calendarDayFromOffset(offset) {
      const day = days[positiveModulo(offset, days.length)];
      return { ...day, weekOffset: Math.floor(offset / days.length), offset };
    }

    function visibleCalendarDays() {
      const count = calendarViewMode === "three" ? 3 : calendarViewMode === "day" ? 1 : 7;
      const start = calendarViewMode === "week" ? Math.floor(calendarStartOffset / 7) * 7 : calendarStartOffset;
      return Array.from({ length: count }, (_, index) => calendarDayFromOffset(start + index));
    }

    function isMobileCalendarLayout() {
      return window.matchMedia("(max-width: 780px)").matches;
    }

    function enforceResponsiveCalendarMode() {
      if (!isMobileCalendarLayout() || calendarViewMode !== "week") return;
      const currentWeekStart = Math.floor(calendarStartOffset / 7) * 7;
      calendarViewMode = "day";
      calendarStartOffset = currentWeekStart + currentBaseDayIndex();
      calendarWeekOffset = Math.floor(calendarStartOffset / 7);
    }

    function calendarNavigationStep() {
      if (calendarViewMode === "day") return 1;
      if (calendarViewMode === "three") return 3;
      return 7;
    }

    function resetCalendarToToday() {
      const todayOffset = currentCalendarOffset();
      calendarStartOffset = calendarViewMode === "week" ? Math.floor(todayOffset / 7) * 7 : todayOffset;
      calendarWeekOffset = Math.floor(calendarStartOffset / 7);
    }

    function updateCalendarHeader(visibleDays = visibleCalendarDays()) {
      const first = visibleDays[0] || days[0];
      const last = visibleDays[visibleDays.length - 1] || first;
      calendarDateRange.textContent = `${fullDateLabel(first.key, first.weekOffset || 0)} - ${fullDateLabel(last.key, last.weekOffset || 0)}`;
      const labels = { day: "一日檢視", three: "三日檢視", week: "週曆檢視" };
      calendarViewHint.textContent = `${labels[calendarViewMode]}，點擊任一時段可建立預約`;
      calendarViewButtons.forEach(button => button.classList.toggle("active", button.dataset.calendarView === calendarViewMode));
    }

    function currentCalendarDayNumber() {
      const now = new Date();
      if (now.getFullYear() === 2026 && now.getMonth() === 4) {
        return now.getDate();
      }
      return 25;
    }

    function getBookingDayNumber(event) {
      return getDayNumber(event.day, event.weekOffset || 0);
    }

    function formatBookingDate(event) {
      const day = days.find(item => item.key === event.day);
      const date = dateForDay(event.day, event.weekOffset || 0);
      return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${day ? day.label : ""}`;
    }

    function getTodayMinutes() {
      const now = new Date();
      if (now.getFullYear() === 2026 && now.getMonth() === 4 && now.getDate() === currentCalendarDayNumber()) {
        return (now.getHours() * 60) + now.getMinutes();
      }
      return 0;
    }

    function isPastDateTime(dayKey, time, weekOffset = 0) {
      const dayNumber = getDayNumber(dayKey, weekOffset);
      const todayNumber = currentCalendarDayNumber();
      if (dayNumber < todayNumber) return true;
      if (dayNumber > todayNumber) return false;
      return timeToMinutes(time) <= getTodayMinutes();
    }

    function isPastBooking(booking) {
      return isPastDateTime(booking.day, booking.time, booking.weekOffset || 0);
    }

    function isTodayBooking(booking) {
      return getBookingDayNumber(booking) === currentCalendarDayNumber();
    }

    function isFutureBooking(booking) {
      return getBookingDayNumber(booking) > currentCalendarDayNumber();
    }

    function formatMinutesAsTime(minutes) {
      const safeMinutes = Math.max(0, Math.min(23 * 60 + 59, Number(minutes) || 0));
      return `${String(Math.floor(safeMinutes / 60)).padStart(2, "0")}:${String(safeMinutes % 60).padStart(2, "0")}`;
    }

    function checkInAvailability(booking) {
      if (!booking || booking.status === "cancelled") {
        return { ok: false, message: "這筆預約已取消，不能簽到。" };
      }
      if (isFutureBooking(booking)) {
        return { ok: false, message: "未來日期的課程還不能簽到；過期課程可補簽。" };
      }
      if (isTodayBooking(booking)) {
        const earliest = timeToMinutes(booking.time) - 60;
        if (getTodayMinutes() < earliest) {
          return {
            ok: false,
            message: `${booking.time} 的課最早 ${formatMinutesAsTime(earliest)} 才能簽到。`
          };
        }
      }
      return { ok: true, message: "" };
    }

    function bookingMemberNames(booking) {
      if (!booking.memberIds || booking.memberIds.length === 0) return "未指定會員";
      return booking.memberIds
        .map(id => members.find(member => member.id === id)?.name)
        .filter(Boolean)
        .join("、") || "未指定會員";
    }

    function syncGroupJoinOptions(booking) {
      const isGroup = booking.kind === "group";
      groupMemberJoinWrap.classList.toggle("hidden", !isGroup);
      groupMemberJoinWrap.classList.add("hidden");
      addGroupMemberBtn.classList.add("hidden");
      if (!isGroup) return;
      const availableMembers = members.filter(member => !booking.memberIds.includes(member.id));
      groupMemberJoin.innerHTML = availableMembers.length
        ? availableMembers.map(member => `<option value="${member.id}">${member.name}｜團 ${member.ticketWallet.group} 堂</option>`).join("")
        : `<option value="">沒有可加入的會員</option>`;
      groupMemberJoin.disabled = availableMembers.length === 0 || booking.memberIds.length >= 5;
      addGroupMemberBtn.disabled = groupMemberJoin.disabled;
    }

    function closeDetailRepeatDialog() {
      detailRepeatModal?.classList.remove("open");
      detailRepeatModal?.setAttribute("aria-hidden", "true");
    }

    function openDetailRepeatDialog() {
      const booking = bookings.find(item => item.id === activeBookingId);
      if (!booking || booking.kind === "trial" || isPastBooking(booking) || booking.status === "cancelled") return;
      renderDetailRepeatOptions(booking);
      detailRepeatModal?.classList.add("open");
      detailRepeatModal?.setAttribute("aria-hidden", "false");
    }

    function closeGroupMemberDialog() {
      pendingGroupDetailMemberId = "";
      if (groupMemberSearch) groupMemberSearch.value = "";
      groupMemberSuggestions?.classList.add("hidden");
      groupMemberSuggestions && (groupMemberSuggestions.innerHTML = "");
      groupMemberModal?.classList.remove("open");
      groupMemberModal?.setAttribute("aria-hidden", "true");
    }

    function groupJoinPredicate(member) {
      const booking = bookings.find(item => item.id === activeBookingId);
      return Boolean(
        booking &&
        booking.kind === "group" &&
        !booking.memberIds.includes(member.id) &&
        (member.ticketWallet.group || 0) > 0
      );
    }

    function selectGroupDetailMember(member) {
      if (!member) return;
      pendingGroupDetailMemberId = member.id;
      groupMemberJoin.value = member.id;
      groupMemberSearch.value = `${member.name}｜團 ${member.ticketWallet.group || 0} 堂`;
      groupMemberSuggestions.classList.add("hidden");
    }

    function openGroupMemberDialog() {
      const booking = bookings.find(item => item.id === activeBookingId);
      if (!booking || booking.kind !== "group" || isPastBooking(booking) || booking.status === "cancelled") return;
      if ((booking.memberIds || []).length >= 5) {
        showToast("這堂小班團課已滿 5 人。", "error", "人數已滿");
        return;
      }
      pendingGroupDetailMemberId = "";
      groupMemberSearch.value = "";
      groupMemberSuggestions.classList.add("hidden");
      groupMemberModal?.classList.add("open");
      groupMemberModal?.setAttribute("aria-hidden", "false");
      setTimeout(() => groupMemberSearch?.focus(), 0);
    }

    function bookingTypeValueFromBooking(booking) {
      if (booking.kind === "friendly") return booking.people >= 2 || booking.title.includes("1v2") ? "friendly-1v2" : "friendly-1v1";
      if (booking.kind === "coaching") return booking.people >= 2 || booking.title.includes("1v2") ? "coaching-1v2" : "coaching-1v1";
      if (booking.kind === "group") return "small-group";
      if (booking.kind === "trial") return "trial-class";
      return "self-training";
    }

    function detailSecondSlotWeekBump(booking, secondDayKey = detailSecondBookingDay.value) {
      return dayIndex(secondDayKey) <= dayIndex(booking.day) ? 1 : 0;
    }

    function detailRepeatSelectedDays() {
      return [...(detailRepeatDayButtons?.querySelectorAll(".repeat-day-btn.selected") || [])]
        .map(button => button.dataset.day)
        .filter(Boolean);
    }

    function detailRepeatTimeForDay(dayKey, fallbackTime = "09:00") {
      const select = detailRepeatTimeList?.querySelector(`[data-repeat-time="${dayKey}"]`);
      return select?.value || fallbackTime;
    }

    function detailRepeatSelectedSlots(booking) {
      return detailRepeatSelectedDays()
        .map(dayKey => {
          const time = detailRepeatTimeForDay(dayKey, booking.time);
          let delta = dayIndex(dayKey) - dayIndex(booking.day);
          if (delta < 0 || (delta === 0 && timeToMinutes(time) <= timeToMinutes(booking.time))) delta += 7;
          return { day: dayKey, time, delta };
        })
        .sort((a, b) => a.delta - b.delta || timeToMinutes(a.time) - timeToMinutes(b.time));
    }

    function renderDetailRepeatTimeRows(booking) {
      const selectedDays = detailRepeatSelectedDays();
      detailRepeatBooking.checked = selectedDays.length > 0;
      detailWeeklyFrequency.value = String(Math.min(Math.max(selectedDays.length, 1), 2));
      detailRepeatTimeList.innerHTML = selectedDays.length
        ? selectedDays.map(dayKey => {
            const day = days.find(item => item.key === dayKey);
            const preferred = detailRepeatTimeForDay(dayKey, dayKey === booking.day ? booking.time : detailSecondBookingTime.value || booking.time);
            const allowedTimes = availableBookingTimesFor(bookingTypeValueFromBooking(booking), dayKey);
            const value = allowedTimes.includes(preferred) ? preferred : (allowedTimes[0] || "09:00");
            return `
              <div class="repeat-time-row">
                <strong>${day?.label || dayKey}</strong>
                <select data-repeat-time="${dayKey}">
                  ${allowedTimes.map(time => `<option value="${time}" ${time === value ? "selected" : ""}>${time}</option>`).join("")}
                </select>
              </div>
            `;
          }).join("")
        : `<div class="repeat-hint">請先選擇星期，才會顯示時間選項。</div>`;
      detailRepeatTimeList.querySelectorAll("[data-repeat-time]").forEach(select => {
        select.addEventListener("change", updateDetailRepeatPreview);
      });
    }

    function renderDetailRepeatDayButtons(booking) {
      detailRepeatDayButtons.innerHTML = days.map(day => `
        <button class="repeat-day-btn ${day.key === booking.day ? "selected" : ""}" type="button" data-day="${day.key}">
          ${day.label}
        </button>
      `).join("");
      detailRepeatDayButtons.querySelectorAll(".repeat-day-btn").forEach(button => {
        button.addEventListener("click", () => {
          const selected = button.classList.contains("selected");
          if (!selected && detailRepeatSelectedDays().length >= 2) {
            showToast("固定預約目前支援一週一次或一週兩次，最多選 2 天。", "error", "已達上限");
            return;
          }
          button.classList.toggle("selected", !selected);
          renderDetailRepeatTimeRows(booking);
          updateDetailRepeatPreview();
        });
      });
      renderDetailRepeatTimeRows(booking);
    }

    function detailRepeatMemberLimit(booking) {
      if (booking.kind === "trial") return 0;
      if (!booking.memberIds || booking.memberIds.length === 0) return 4;
      const walletKey = bookingWalletKey(booking);
      if (walletKey === "selfTraining") return 12;
      return Math.min(...booking.memberIds.map(id => {
        const member = members.find(item => item.id === id);
        if (!member) return 0;
        syncWalletFromBuckets(member);
        return member.ticketWallet[walletKey] || 0;
      }));
    }

    function renderDetailRepeatOptions(booking) {
      const expired = isPastBooking(booking) || booking.status === "cancelled";
      detailRepeatCard.classList.toggle("hidden", expired || booking.kind === "trial");
      detailRepeatBooking.checked = false;
      detailRepeatCard.classList.remove("active", "twice");
      if (expired || booking.kind === "trial") return;

      const limit = Math.max(0, detailRepeatMemberLimit(booking));
      const baseOptions = [1, 2, 3, 4, 6, 8, 10, 12].filter(count => count <= limit);
      const countOptions = baseOptions.length ? baseOptions : [1];
      detailRepeatCount.innerHTML = countOptions.map(count => `<option value="${count}">${count} 堂</option>`).join("");
      detailRepeatCount.value = String(countOptions[0]);

      const preferredSecondDay = days[(dayIndex(booking.day) + 3) % days.length]?.key || booking.day;
      detailSecondBookingDay.innerHTML = days.map(day => {
        const offset = (booking.weekOffset || 0) + detailSecondSlotWeekBump(booking, day.key);
        return `<option value="${day.key}">${day.label} ${shortDateLabel(day.key, offset)}</option>`;
      }).join("");
      detailSecondBookingDay.value = preferredSecondDay;
      renderDetailSecondTimeOptions(booking, booking.time);
      renderDetailRepeatDayButtons(booking);
      updateDetailRepeatPreview();
    }

    function renderDetailSecondTimeOptions(booking, preferredTime = detailSecondBookingTime.value || booking.time) {
      const allowedTimes = availableBookingTimesFor(bookingTypeValueFromBooking(booking), detailSecondBookingDay.value);
      detailSecondBookingTime.innerHTML = allowedTimes.map(time => `<option value="${time}">${time}</option>`).join("");
      detailSecondBookingTime.value = allowedTimes.includes(preferredTime) ? preferredTime : (allowedTimes[0] || "09:00");
    }

    function getDetailRepeatOccurrences(booking) {
      const count = Number(detailRepeatCount.value) || 1;
      const slots = detailRepeatSelectedSlots(booking);
      const frequency = slots.length || 1;
      const occurrences = [];
      if (!detailRepeatBooking.checked || slots.length === 0) return occurrences;

      for (let index = 0; index < count; index += 1) {
        const slot = slots[index % frequency];
        const cycle = Math.floor(index / frequency);
        const offset = slot.delta + (7 * cycle);
        const target = calendarDayFromOffset((dayIndex(booking.day) + (booking.weekOffset || 0) * 7) + offset);
        occurrences.push({
          weekOffset: target.weekOffset,
          day: target.key,
          time: slot.time,
          slotNumber: (index % frequency) + 1
        });
      }

      return occurrences;
    }

    function validateDetailRepeatSlot(booking, occurrence) {
      if (isPastDateTime(occurrence.day, occurrence.time, occurrence.weekOffset)) {
        return { ok: false, message: "這個時段已過期，不能建立固定預約。" };
      }
      if (booking.kind === "friendly" && !isFriendlyAvailable(occurrence.day, occurrence.time)) {
        return { ok: false, message: "友善教練課只能安排平日 09:00 到 18:00。" };
      }
      const windowCaps = bookingWindowCapacities(occurrence.day, occurrence.time, occurrence.weekOffset);
      const maxGeneral = Math.max(...windowCaps.map(item => item.cap.general), 0);
      const maxGroup = Math.max(...windowCaps.map(item => item.cap.group), 0);
      const coachConflict = booking.kind !== "self"
        ? bookingCoachConflict(occurrence.day, occurrence.time, occurrence.weekOffset, bookingCoachName(booking))
        : null;
      if (coachConflict) {
        return { ok: false, message: coachConflictMessage(coachConflict, bookingCoachName(booking)) };
      }
      if (booking.kind === "group" && maxGroup + booking.groupSlot > 1) {
        return { ok: false, message: "這個時段已經有團課。" };
      }
      if (booking.kind !== "group" && maxGeneral + booking.general > 3) {
        return { ok: false, message: "這個時段一般預約已滿 3 組。" };
      }
      return { ok: true, message: "" };
    }

    function validateDetailRepeat(booking) {
      if (!detailRepeatBooking.checked) return { ok: true, occurrences: [], message: "開啟後可從這筆預約往後建立固定課。" };
      const occurrences = getDetailRepeatOccurrences(booking);
      const seen = new Set();
      const walletKey = bookingWalletKey(booking);

      if (booking.memberIds?.length && booking.kind === "self") {
        for (const memberId of booking.memberIds) {
          const member = members.find(item => item.id === memberId);
          if (member) syncWalletFromBuckets(member);
          const regularTickets = Math.max(0, Number(member?.ticketWallet?.selfTraining) || 0);
          const friendlyTickets = Math.max(0, Number(member?.ticketWallet?.friendlySelfTraining) || 0);
          const regularNeeded = occurrences.filter(item => !friendlySelfTrainingUsable(item.day, item.time)).length;
          if (!member || regularNeeded > regularTickets || occurrences.length > regularTickets + friendlyTickets) {
            return { ok: false, occurrences, message: `${member?.name || "會員"} 自主訓練票券不足，友善自主只能安排在平日離峰。` };
          }
        }
      }

      if (booking.memberIds?.length && walletKey !== "selfTraining" && booking.kind !== "trial") {
        for (const memberId of booking.memberIds) {
          const member = members.find(item => item.id === memberId);
          if (member) syncWalletFromBuckets(member);
          if (!member || (member.ticketWallet[walletKey] || 0) < occurrences.length) {
            return { ok: false, occurrences, message: `${member?.name || "會員"} 票券不足，無法建立 ${occurrences.length} 堂固定預約。` };
          }
        }
      }

      for (const occurrence of occurrences) {
        const key = `${occurrence.weekOffset}-${occurrence.day}-${occurrence.time}`;
        if (seen.has(key)) return { ok: false, occurrences, message: "固定預約裡有重複時段，請調整第二次日期或時間。" };
        seen.add(key);
        const validation = validateDetailRepeatSlot(booking, occurrence);
        if (!validation.ok) {
          const day = days.find(item => item.key === occurrence.day);
          return { ok: false, occurrences, message: `${day?.label || ""} ${shortDateLabel(occurrence.day, occurrence.weekOffset)} ${occurrence.time}：${validation.message}` };
        }
      }
      return { ok: true, occurrences, message: `可建立後續 ${occurrences.length} 堂固定預約。` };
    }

    function updateDetailRepeatPreview() {
      const booking = bookings.find(item => item.id === activeBookingId);
      if (!booking) return;
      const frequency = detailRepeatSelectedSlots(booking).length || 1;
      detailRepeatCard.classList.toggle("active", detailRepeatBooking.checked);
      detailRepeatCard.classList.toggle("twice", detailRepeatBooking.checked && frequency === 2);
      const validation = validateDetailRepeat(booking);
      detailRepeatSummary.textContent = validation.message;
      detailRepeatSummary.style.color = validation.ok ? "" : "var(--red)";
      createDetailRepeatBtn.disabled = !detailRepeatBooking.checked || !validation.ok;
    }

    async function createRepeatFromActiveBooking() {
      const booking = bookings.find(item => item.id === activeBookingId);
      if (!booking) return;
      const validation = validateDetailRepeat(booking);
      if (!validation.ok || !validation.occurrences.length) {
        detailRepeatSummary.textContent = validation.message;
        detailRepeatSummary.style.color = "var(--red)";
        return;
      }
      if (!(await confirmChange(`確認要為 ${bookingMemberNames(booking)} 建立後續 ${validation.occurrences.length} 堂固定預約嗎？`))) return;

      const seriesId = booking.seriesId || Date.now();
      booking.seriesId = seriesId;
      const createdBookings = validation.occurrences.map(occurrence => ({
        ...booking,
        id: `booking-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        day: occurrence.day,
        time: occurrence.time,
        weekOffset: occurrence.weekOffset,
        seriesId,
        seriesSlotNumber: occurrence.slotNumber,
        note: "",
        checkIns: [],
        checkedIn: false,
        memberIds: [...(booking.memberIds || [])]
      }));
      bookings.push(...createdBookings);

      const walletKey = bookingWalletKey(booking);
      if (booking.kind === "self") {
        createdBookings.forEach(newBooking => {
          newBooking.memberIds.forEach(memberId => {
            const member = members.find(item => item.id === memberId);
            consumeSelfTrainingTicket(member, 1, newBooking.day, newBooking.time);
          });
        });
      } else if (walletKey !== "selfTraining" && booking.kind !== "trial") {
        createdBookings.forEach(newBooking => {
          newBooking.memberIds.forEach(memberId => {
            const member = members.find(item => item.id === memberId);
            consumeMemberTicket(member, walletKey, 1);
          });
        });
      }

      saveAppData();
      renderCalendar();
      renderMemberProfile();
      renderDetailRepeatOptions(booking);
      addActivity("新增", `${bookingMemberNames(booking)} 建立固定預約 ${createdBookings.length} 堂`);
      detailRepeatSummary.textContent = `已建立 ${createdBookings.length} 堂固定預約。`;
      detailRepeatSummary.style.color = "";
      await confirmChange([
        "固定預約已建立",
        `會員：${bookingMemberNames(booking)}`,
        `新增堂數：${createdBookings.length} 堂`,
        "確認後會關閉固定預約視窗。"
      ].join("\n"));
      closeBookingDetail();
    }

    function bookingMemberLinkMarkup(booking) {
      if (!booking.memberIds || booking.memberIds.length === 0) return `<strong>未指定會員</strong>`;
      const links = booking.memberIds
        .map(id => members.find(member => member.id === id))
        .filter(Boolean)
        .map(member => `<button class="member-detail-link" type="button" data-open-booking-member="${member.id}">${member.name}</button>`)
        .join("");
      return links || `<strong>未指定會員</strong>`;
    }

    function openBookingDetail(bookingId) {
      const booking = bookings.find(item => item.id === bookingId);
      if (!booking) return;
      activeBookingId = bookingId;
      const day = days.find(item => item.key === booking.day);
      const expired = isPastBooking(booking);
      bookingModalTitle.textContent = booking.title;
      bookingModalSubtitle.textContent = `${formatBookingDate(booking)} ${booking.time}${expired ? "｜已過期，只能刪除" : ""}`;
      bookingDetailGrid.innerHTML = `
        <div class="detail-item">會員<div>${bookingMemberLinkMarkup(booking)}</div></div>
        <div class="detail-item">日期<strong>${day ? `${day.label} ${shortDateLabel(booking.day, booking.weekOffset || 0)}` : booking.day}</strong></div>
        <div class="detail-item">時間<strong>${booking.time}</strong></div>
      `;
      bookingDetailGrid.querySelectorAll("[data-open-booking-member]").forEach(button => {
        button.addEventListener("click", async () => {
          const memberId = button.dataset.openBookingMember;
          closeBookingDetail();
          openMemberCardById(memberId);
        });
      });
      detailMemberWrap.classList.toggle("hidden", booking.kind === "group");
      const detailMember = members.find(member => member.id === booking.memberIds?.[0]);
      detailMemberSelect.value = detailMember ? bookingMemberOptionLabel(detailMember) : "";
      detailCoachSelect.value = [...detailCoachSelect.options].some(option => option.value === bookingCoachName(booking))
        ? bookingCoachName(booking)
        : "不指定";
      renderGroupMemberProgress(booking);
      bookingNote.value = booking.note || "";
      syncGroupJoinOptions(booking);
      renderDetailRepeatOptions(booking);
      openDetailRepeatModalBtn?.classList.toggle("hidden", expired || booking.status === "cancelled" || booking.kind === "trial");
      openDetailRepeatModalBtn.disabled = expired || booking.status === "cancelled" || booking.kind === "trial";
      detailMemberSelect.disabled = expired || booking.status === "cancelled";
      detailCoachSelect.disabled = expired || booking.status === "cancelled";
      bookingNote.disabled = expired || booking.status === "cancelled";
      saveBookingNoteBtn.disabled = booking.status === "cancelled";
      groupMemberJoin.disabled = expired || booking.status === "cancelled" || groupMemberJoin.disabled;
      addGroupMemberBtn.disabled = expired || booking.status === "cancelled" || booking.kind !== "group";
      bookingCheckInBtn.style.display = booking.kind === "group" ? "none" : "";
      bookingCheckInBtn.textContent = eventIsCheckedIn(booking) ? "已簽到" : expired ? "補簽" : "簽到";
      const checkInState = checkInAvailability(booking);
      bookingCheckInBtn.disabled = !checkInState.ok || booking.status === "cancelled" || eventIsCheckedIn(booking);
      bookingCheckInBtn.title = checkInState.message || "";
      cancelBookingBtn.textContent = expired ? "刪除預約" : "取消預約";
      cancelBookingBtn.disabled = booking.status === "cancelled";
      bookingModal.classList.add("open");
      bookingModal.setAttribute("aria-hidden", "false");
    }

    function closeBookingDetail() {
      activeBookingId = "";
      closeDetailRepeatDialog();
      closeGroupMemberDialog();
      bookingModal.classList.remove("open");
      bookingModal.setAttribute("aria-hidden", "true");
    }

    async function saveActiveBookingNote() {
      const booking = bookings.find(item => item.id === activeBookingId);
      if (!booking) return;
      if (isPastBooking(booking)) {
        closeBookingDetail();
        formMessage.className = "message error";
        formMessage.textContent = "這筆預約已過期，已關閉視窗；如需處理請使用刪除預約。";
        return;
      }
      const nextCoach = detailCoachSelect.value;
      const originalCoach = bookingCoachName(booking);
      const previousMemberId = booking.memberIds?.[0] || "";
      const nextMemberId = booking.kind !== "group" ? resolveBookingMemberId(detailMemberSelect.value) : previousMemberId;
      const nextNote = bookingNote.value.trim();
      const originalNote = String(booking.note || "").trim();
      const memberChanged = booking.kind !== "group" && previousMemberId !== nextMemberId;
      const coachChanged = booking.kind !== "self" && nextCoach !== originalCoach;
      const noteChanged = nextNote !== originalNote;

      if (!memberChanged && !coachChanged && !noteChanged) {
        closeBookingDetail();
        formMessage.className = "message";
        formMessage.textContent = "沒有修改內容，已關閉預約視窗。";
        return;
      }

      const coachConflict = coachChanged && booking.kind !== "self"
        ? bookingCoachConflict(booking.day, booking.time, booking.weekOffset || 0, nextCoach, booking.id)
        : null;
      if (coachConflict) {
        formMessage.className = "message error";
        formMessage.textContent = coachConflictMessage(coachConflict, nextCoach);
        return;
      }
      if (!(await confirmChange(`確認要儲存 ${bookingMemberNames(booking)} 的預約修改嗎？`))) return;
      if (booking.kind !== "group") {
        if (!previousMemberId && nextMemberId) {
          const member = members.find(item => item.id === nextMemberId);
          const walletKey = bookingWalletKey(booking);
          if (member && walletKey === "selfTraining" && availableSelfTrainingTickets(member, booking.day, booking.time) <= 0) {
            formMessage.className = "message error";
            formMessage.textContent = `${member.name} 沒有可用自主訓練票券。`;
            return;
          }
          if (member && walletKey !== "selfTraining" && (member.ticketWallet[walletKey] || 0) <= 0) {
            formMessage.className = "message error";
            formMessage.textContent = `${member.name} 沒有可用${walletKey === "group" ? "團課" : "課程"}票券。`;
            return;
          }
          if (member && walletKey === "selfTraining") {
            consumeSelfTrainingTicket(member, 1, booking.day, booking.time);
          } else if (member && walletKey !== "selfTraining") {
            consumeMemberTicket(member, walletKey, 1);
          }
        }
        booking.memberIds = nextMemberId ? [nextMemberId] : [];
      }
      if (booking.kind !== "self") setBookingCoach(booking, nextCoach);
      booking.note = nextNote;
      saveAppData();
      renderCalendar();
      renderMemberProfile();
      closeBookingDetail();
      addActivity("修改", `${bookingMemberNames(booking)} ${booking.title}`);
      formMessage.className = "message";
      formMessage.textContent = "預約內容已更新，視窗已關閉。";
    }

    async function cancelActiveBooking() {
      const bookingIndex = bookings.findIndex(item => item.id === activeBookingId);
      const booking = bookings[bookingIndex];
      if (!booking) return;
      const expired = isPastBooking(booking);
      let targets = [booking];
      if (!expired && booking.seriesId) {
        const includeFollowing = await confirmChange([
          "這是固定預約。",
          "要連同這堂之後的固定課一起取消嗎？",
          "",
          "確認：取消這堂與後續固定課",
          "取消：只取消目前這一堂，下一步仍會再確認"
        ].join("\n"));
        if (includeFollowing) targets = followingSeriesBookings(booking);
      }
      if (!(await confirmChange(expired
        ? `確認要刪除 ${bookingMemberNames(booking)} 的過期預約嗎？`
        : [
          `確認要取消 ${bookingMemberNames(booking)} 的預約嗎？`,
          targets.length > 1 ? `本次會取消 ${targets.length} 堂固定預約。` : "本次只取消 1 堂。",
          "未來課程會把已預扣的票券補回會員。"
        ].join("\n")))) return;
      let restoredTickets = 0;
      if (expired) {
        bookings.splice(bookingIndex, 1);
      } else {
        targets.forEach(target => {
          target.status = "cancelled";
          if (target.id === booking.id) target.note = bookingNote.value.trim() || target.note;
          restoredTickets += restoreTicketsForBooking(target);
        });
      }
      saveAppData();
      renderCalendar();
      renderMemberProfile();
      closeBookingDetail();
      addActivity(expired ? "刪除" : "取消", `${bookingMemberNames(booking)} ${booking.title}`);
      formMessage.className = "message";
      formMessage.textContent = expired
        ? "已刪除這筆過期預約。"
        : `已取消 ${targets.length} 堂預約，並補回 ${restoredTickets} 張票券。`;
    }

    async function addMemberToActiveGroup() {
      const booking = bookings.find(item => item.id === activeBookingId);
      if (!booking || booking.kind !== "group") return;
      if (isPastBooking(booking)) {
        formMessage.className = "message error";
        formMessage.textContent = "這堂團課已過期，不能再加入學員，只能刪除。";
        return;
      }
      if (booking.memberIds.length >= 5) {
        formMessage.className = "message error";
        formMessage.textContent = "這堂小班團課已滿 5 人。";
        return;
      }
      const selectedMemberId = pendingGroupDetailMemberId;
      if (!selectedMemberId) {
        showToast("請先輸入姓名並選擇要加入的團課學員。", "error", "尚未選擇會員");
        return;
      }
      const member = members.find(item => item.id === selectedMemberId);
      if (!member) return;
      if ((member.ticketWallet.group || 0) <= 0) {
        formMessage.className = "message error";
        formMessage.textContent = `${member.name} 沒有可用小班團課票券。`;
        return;
      }
      if (!(await confirmChange(`確認要把 ${member.name} 加入這堂團課嗎？`))) return;
      booking.memberIds.push(member.id);
      booking.people = booking.memberIds.length;
      consumeMemberTicket(member, "group", 1);
      const groupDetailTitle = booking.detail?.split("，")[0] || booking.title;
      booking.detail = `${groupDetailTitle}，${bookingMemberNames(booking)}，${booking.memberIds.length}/5 人`;
      saveAppData();
      renderMemberSelect();
      renderBookingTypeOptions();
      renderProfileSelect();
      renderMemberProfile();
      renderCalendar();
      openBookingDetail(booking.id);
      closeGroupMemberDialog();
      addActivity("新增", `${member.name} 加入 ${booking.title}`);
      formMessage.className = "message";
      formMessage.textContent = `已將 ${member.name} 加入小班團課，並扣 1 堂團課票券。`;
    }

    async function checkInBooking(bookingId, memberId = "") {
      const booking = bookings.find(item => item.id === bookingId);
      if (!booking || booking.status === "cancelled") return;
      if (!booking.memberIds || booking.memberIds.length === 0) {
        formMessage.className = "message error";
        formMessage.textContent = "這筆預約尚未指定會員，不能簽到。";
        return;
      }
      const targetMemberIds = memberId ? [memberId] : [...booking.memberIds];
      const alreadyChecked = targetMemberIds.every(id => booking.checkIns?.includes(id));
      if (alreadyChecked) {
        formMessage.className = "message error";
        formMessage.textContent = "這堂課已經簽到過，不能重複簽到或重複儲值自主訓練。";
        return;
      }
      const availability = checkInAvailability(booking);
      if (!availability.ok) {
        formMessage.className = "message error";
        formMessage.textContent = availability.message;
        showToast(availability.message, "error", "尚未開放簽到");
        return;
      }
      const today = todayDateSlash();
      const earnsRegularSelfTraining = isTodayBooking(booking) && booking.kind === "coaching";
      const earnsFriendlySelfTraining = isTodayBooking(booking) && booking.kind === "friendly";
      const earnsSelfTraining = earnsRegularSelfTraining || earnsFriendlySelfTraining;
      const checkInAction = earnsSelfTraining ? "簽到" : "補簽";
      const checkInRewardText = booking.kind === "group"
        ? "團課簽到只記錄出席，不會儲值自主訓練點數。"
        : earnsFriendlySelfTraining
          ? "當天簽到會自動儲值友善自主 +2 點，限平日離峰使用。"
          : earnsRegularSelfTraining
            ? "當天簽到會自動儲值自主訓練 +2 點。"
            : "補簽或非教練課只記錄出席，不會儲值自主訓練點數。";
      if (!(await confirmChange([
        `確認${checkInAction}`,
        `會員：${bookingMemberNames(booking)}`,
        `課程：${booking.title}`,
        `時間：${formatBookingDate(booking)} ${booking.time}`,
        checkInRewardText
      ].join("\n")))) return;
      booking.checkIns = Array.from(new Set([...(booking.checkIns || []), ...targetMemberIds]));
      booking.checkedIn = booking.memberIds.every(id => booking.checkIns.includes(id));
      const checkedMembers = targetMemberIds
        .map(id => members.find(member => member.id === id))
        .filter(Boolean);
      checkedMembers.forEach(member => {
        member.status = "已簽到";
        updateMemberLevelFromCompletedCourses(member);
        if (earnsSelfTraining) {
          const rewardType = earnsFriendlySelfTraining ? "friendlySelfTraining" : "selfTraining";
          const rewardLabel = earnsFriendlySelfTraining ? "友善自主" : "自主";
          const rewardPlanKey = earnsFriendlySelfTraining ? "checkInFriendlySelfTraining" : "checkInSelfTraining";
          addTicketBucket(member, {
            type: rewardType,
            label: rewardLabel,
            total: 2,
            remaining: 2,
            isBonus: false,
            planKey: rewardPlanKey,
            expiry: todayDateSlash(6)
          });
          syncWalletFromBuckets(member);
          member.ticketExpiry[rewardType] = todayDateSlash(6);
          member.rechargeHistory.unshift({
            date: today,
            type: "課程簽到",
            count: 2,
            pricePlan: `${rewardLabel} 2 點`,
            amount: 0,
            collector: "系統",
            paymentMode: "小卡簽到",
            installment: earnsFriendlySelfTraining ? "含當天 1 週，限平日離峰" : "含當天 1 週"
          });
        }
      });
      saveAppData();
      renderMemberSelect();
      renderBookingTypeOptions();
      renderProfileSelect();
      renderMemberProfile();
      renderCalendar();
      openBookingDetail(bookingId);
      updatePreview();
      formMessage.className = "message";
      const checkedNameText = checkedMembers.map(member => member.name).join("、") || bookingMemberNames(booking);
      formMessage.textContent = earnsSelfTraining
        ? `${checkedNameText} 已完成簽到並加 ${earnsFriendlySelfTraining ? "友善自主" : "自主訓練"} +2 點，期限 ${todayDateSlash(6)}。`
        : `${checkedNameText} 已完成出席紀錄，沒有發放自主訓練點數。`;
    }

    function renderMemberMonthCalendar(memberOverride = getProfileMember(), target = memberMonthCalendar) {
      const member = memberOverride;
      if (!member) {
        target.innerHTML = "";
        return;
      }
      const monthDays = Array.from({ length: 31 }, (_, index) => index + 1);
      const monthCells = [...Array(4).fill(null), ...monthDays];
      const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];
      const memberEvents = getMemberEvents(member.id);
      const quickOptions = quickBookingTypeOptions(member);
      const quickDateOptions = Array.from({ length: 28 }, (_, index) => calendarDayFromOffset(currentBaseDayIndex() + index));

      const todayNumber = currentCalendarDayNumber();
      target.innerHTML = `
        <div class="section-header" style="padding: 12px 12px 0; margin-bottom: 10px;">
          <div>
            <strong>2026 年 5 月約課月曆</strong>
            <span>${member.name} 的課程與自主訓練紀錄</span>
          </div>
        </div>
        ${quickBookingMemberId === member.id ? `
          <div class="quick-book-box">
            <div class="field">
              <label for="quickBookingType">課程</label>
              <select id="quickBookingType" ${quickOptions.length ? "" : "disabled"}>
                ${quickOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join("")}
              </select>
            </div>
            ${quickOptions.length ? "" : `<div class="message error">這位會員目前沒有可預約的票券，請先儲值票券。</div>`}
            <div class="field">
              <label for="quickBookingDay">日期</label>
              <select id="quickBookingDay">
                ${quickDateOptions.map(day => `<option value="${day.key}|${day.weekOffset}">${day.label} ${shortDateLabel(day.key, day.weekOffset)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="quickBookingTime">時間</label>
              <select id="quickBookingTime">${times.map(time => `<option value="${time}">${time}</option>`).join("")}</select>
            </div>
            <div class="field">
              <label for="quickBookingCoach">教練</label>
              <select id="quickBookingCoach">
                ${staffMembers.filter(staff => String(staff.role || "").includes("教練")).map(staff => `<option value="${staff.displayName}">${staff.displayName}</option>`).join("")}
                <option value="不指定">不指定</option>
              </select>
            </div>
            <div class="repeat-card quick-repeat-card" id="quickRepeatCard">
              <div class="switch-row">
                <div class="switch-copy">
                  <strong>固定預約</strong>
                  <span>用目前可用票券，自動建立每週同一時間。</span>
                </div>
                <label class="switch" for="quickRepeatBooking" aria-label="開啟固定預約">
                  <input id="quickRepeatBooking" type="checkbox" ${quickOptions.length ? "" : "disabled"}>
                  <span class="slider"></span>
                </label>
              </div>
              <div class="repeat-options">
                <div class="field">
                  <label for="quickWeeklyFrequency">固定頻率</label>
                  <select id="quickWeeklyFrequency">
                    <option value="1">一週一次</option>
                    <option value="2">一週兩次</option>
                  </select>
                </div>
                <div class="field">
                  <label for="quickTicketCount">可預約堂數</label>
                  <select id="quickTicketCount" disabled></select>
                </div>
                <div class="field secondary-slot">
                  <label for="quickSecondBookingDay">第二次日期</label>
                  <select id="quickSecondBookingDay">
                    ${quickDateOptions.map(day => `<option value="${day.key}|${day.weekOffset}">${day.label} ${shortDateLabel(day.key, day.weekOffset)}</option>`).join("")}
                  </select>
                </div>
                <div class="field secondary-slot">
                  <label for="quickSecondBookingTime">第二次時間</label>
                  <select id="quickSecondBookingTime">
                    ${times.map(time => `<option value="${time}">${time}</option>`).join("")}
                  </select>
                </div>
              </div>
            </div>
            <button class="primary-btn" type="button" data-submit-quick-booking="${member.id}" ${quickOptions.length ? "" : "disabled"}>建立預約</button>
          </div>
        ` : ""}
        <div class="month-grid">
          ${weekdayLabels.map(label => `<div class="month-head">週${label}</div>`).join("")}
          ${monthCells.map(dayNumber => {
            if (!dayNumber) return `<div class="month-day muted"></div>`;
            const events = memberEvents.filter(event => getBookingDayNumber(event) === dayNumber);
            return `
              <div class="month-day ${dayNumber < todayNumber ? "muted" : ""} ${dayNumber === todayNumber ? "today" : ""}">
                <span class="month-date">${dayNumber}</span>
                ${events.map(event => `
                  <span class="month-event ${event.kind}">
                    <strong>${event.time}</strong>
                    <span>${courseShortTag(event)}</span>
                    <span>${compactProgressText(member, event) ? `(${compactProgressText(member, event)})` : ""}</span>
                  </span>
                `).join("")}
              </div>
            `;
          }).join("")}
        </div>
      `;
      target.querySelector("[data-quick-book-member]")?.addEventListener("click", async () => {
        openQuickBookingForMember(member.id);
      });
      target.querySelector("[data-submit-quick-booking]")?.addEventListener("click", async () => {
        submitQuickBooking(member.id);
      });
      const syncQuickRepeat = () => {
        const typeValue = target.querySelector("#quickBookingType")?.value || "";
        const syncTimeSelects = (daySelector, hourSelector, minuteSelector, timeSelector = null) => {
          const [dayValue] = (target.querySelector(daySelector)?.value || "mon|0").split("|");
          const allowedTimes = availableBookingTimesFor(typeValue, dayValue);
          const hourSelect = target.querySelector(hourSelector);
          const minuteSelect = target.querySelector(minuteSelector);
          const timeSelect = timeSelector ? target.querySelector(timeSelector) : null;
          if (timeSelect) {
            timeSelect.innerHTML = allowedTimes.map(time => `<option value="${time}">${time}</option>`).join("");
            return;
          }
          if (!hourSelect || !minuteSelect) return;
          const currentHour = hourSelect.value;
          const hours = Array.from(new Set(allowedTimes.map(time => time.split(":")[0])));
          hourSelect.innerHTML = hours.map(hour => `<option value="${hour}">${hour} 時</option>`).join("");
          hourSelect.value = hours.includes(currentHour) ? currentHour : (hours[0] || "09");
          const minutes = allowedTimes.filter(time => time.startsWith(`${hourSelect.value}:`)).map(time => time.split(":")[1]);
          minuteSelect.innerHTML = minutes.map(minute => `<option value="${minute}">${minute} 分</option>`).join("");
        };
        syncTimeSelects("#quickBookingDay", "#quickBookingHour", "#quickBookingMinute");
        syncTimeSelects("#quickSecondBookingDay", "", "", "#quickSecondBookingTime");
        const quickTimeSelect = target.querySelector("#quickBookingTime");
        if (quickTimeSelect) {
          const [quickDayValue] = (target.querySelector("#quickBookingDay")?.value || "mon|0").split("|");
          const allowedTimes = availableBookingTimesFor(typeValue, quickDayValue);
          const currentTime = quickTimeSelect.value;
          quickTimeSelect.innerHTML = allowedTimes.map(time => `<option value="${time}">${time}</option>`).join("");
          quickTimeSelect.value = allowedTimes.includes(currentTime) ? currentTime : (allowedTimes[0] || "09:00");
        }
        const count = typeValue ? quickBookingTicketCount(member, typeValue) : 0;
        const quickTicketCount = target.querySelector("#quickTicketCount");
        if (quickTicketCount) {
          quickTicketCount.innerHTML = `<option value="${count}">${count} 堂</option>`;
          quickTicketCount.value = String(count);
        }
        const quickRepeatCard = target.querySelector("#quickRepeatCard");
        const quickRepeatBooking = target.querySelector("#quickRepeatBooking");
        const frequency = Number(target.querySelector("#quickWeeklyFrequency")?.value || 1);
        quickRepeatCard?.classList.toggle("active", Boolean(quickRepeatBooking?.checked));
        quickRepeatCard?.classList.toggle("twice", Boolean(quickRepeatBooking?.checked) && frequency === 2);
      };
      target.querySelector("#quickBookingType")?.addEventListener("change", syncQuickRepeat);
      target.querySelector("#quickBookingDay")?.addEventListener("change", syncQuickRepeat);
      target.querySelector("#quickBookingHour")?.addEventListener("change", syncQuickRepeat);
      target.querySelector("#quickSecondBookingDay")?.addEventListener("change", syncQuickRepeat);
      target.querySelector("#quickRepeatBooking")?.addEventListener("change", syncQuickRepeat);
      target.querySelector("#quickWeeklyFrequency")?.addEventListener("change", syncQuickRepeat);
      syncQuickRepeat();
    }

    function syncTicketCount() {
      const member = getSelectedMember();
      const plan = getPlanInfo(bookingType.value);
      const value = ticketCountOverride !== null
        ? Math.max(0, Number(ticketCountOverride) || 0)
        : plan.kind === "group" && selectedGroupMembers().length
          ? Math.min(...selectedGroupMembers().map(item => availableBookingTickets(item, plan)))
          : member ? Math.max(0, availableBookingTickets(member, plan)) : 0;
      const options = [0, 1, 2, 3, 4, 6, 8, 10, 12];
      if (!options.includes(value)) options.push(value);
      options.sort((a, b) => a - b);
      ticketCount.innerHTML = options.map(count => `<option value="${count}">${count} 堂</option>`).join("");
      ticketCount.value = String(value);
    }

    function updateTicketPreview() {
      const member = getSelectedMember();
      const plan = getPlanInfo(bookingType.value);
      if (plan.kind === "group") {
        const selected = selectedGroupMembers();
        ticketPreview.textContent = selected.length
          ? `已加入 ${selected.length}/5 位學員：${selected.map(item => item.name).join("、")}。每位各扣 1 堂團課票券。`
          : "可以先建立團課空班，之後再由客人或櫃台加入學員，最多 5 人。";
        return;
      }
      if (!member) {
        ticketPreview.textContent = plan.kind === "trial"
          ? "體驗課可以先建立未指定會員預約，之後再補上新客資料。"
          : "未選會員也可以建立預約，會記為未指定會員；若要扣票券，請在此選擇會員。";
        return;
      }
      if (plan.kind === "trial") {
        ticketPreview.textContent = `${member.name} 預約體驗課，不扣課程票券。`;
        return;
      }
      if (plan.kind === "self") {
        ticketPreview.textContent = `${member.name} 自主訓練票券剩餘 ${availableBookingTickets(member, plan)} 堂。`;
        return;
      }

      const repeatText = repeatBooking.checked ? `固定預約最多會用 ${getRepeatCount()} 堂。` : "單次預約會扣 1 堂。";
      const available = availableBookingTickets(member, plan);
      const renewText = available === 1 ? " 續約提醒：這是最後 1 堂。" : "";
      ticketPreview.textContent = `${member.name} 的${bookingTicketLabel(plan)}剩餘 ${available} 堂。${repeatText}${renewText}`;
    }

    function capacityFor(dayKey, time, weekOffset = 0, excludeBookingId = "") {
      // 檢查指定 30 分鐘格子內，有哪些 60 分鐘預約覆蓋到它。
      // 場地規則用這裡統一計算：一般課程最多 3 組；團課同時段最多 1 組。
      const excludeIds = Array.isArray(excludeBookingId) ? excludeBookingId : [excludeBookingId].filter(Boolean);
      const sameSlot = bookings.filter(item =>
        !excludeIds.includes(item.id) &&
        item.status !== "cancelled" &&
        item.day === dayKey &&
        (item.weekOffset || 0) === weekOffset &&
        bookingCoversSlot(item, time)
      );
      return {
        general: sameSlot.reduce((sum, item) => sum + item.general, 0),
        group: sameSlot.reduce((sum, item) => sum + item.groupSlot, 0),
        events: sameSlot
      };
    }

    function timeToMinutes(time) {
      const [hour, minute] = time.split(":").map(Number);
      return (hour * 60) + minute;
    }

    function bookingCoversSlot(booking, slotTime) {
      const start = timeToMinutes(booking.time);
      const slot = timeToMinutes(slotTime);
      return slot >= start && slot < start + 60;
    }

    function bookingWindowCapacities(dayKey, time, weekOffset = 0, excludeBookingId = "") {
      const start = timeToMinutes(time);
      return times
        .filter(slotTime => {
          const minutes = timeToMinutes(slotTime);
          return minutes >= start && minutes < start + 60;
        })
        .map(slotTime => ({ time: slotTime, cap: capacityFor(dayKey, slotTime, weekOffset, excludeBookingId) }));
    }

    function isFriendlyAvailable(dayKey, time) {
      const day = days.find(item => item.key === dayKey);
      const start = timeToMinutes(time);
      return day.weekday && start >= 9 * 60 && start + 60 <= 18 * 60;
    }

    function capacityPill(type, count, max) {
      let status = "ok";
      if (count >= max) status = "full";
      else if (count === max - 1) status = "warn";
      if (type === "group" && count > 0) status = "group";
      const label = type === "group" ? `團課 ${count}/${max}` : `一般 ${count}/${max}`;
      return `<span class="pill ${status}">${label}</span>`;
    }

    function eventHasMember(event, memberId = bookingMemberId) {
      return Array.isArray(event.memberIds) && event.memberIds.includes(memberId);
    }

    function currentClockLabel() {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    }

    function todayDateSlash(offsetDays = 0) {
      const date = new Date();
      date.setDate(date.getDate() + offsetDays);
      return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    }

    function dateInputValue(value = "") {
      return String(value || "").replaceAll("/", "-");
    }

    function updateClockDisplay() {
      const clock = document.querySelector("#currentClock");
      if (clock) clock.textContent = currentClockLabel();
    }

    function arrangeBookingLanes(events) {
      // 將同一天互相重疊的 60 分鐘小卡分配到不同欄位。
      // 目標是像營業用排程表一樣，卡片並排顯示，而不是全部疊在一起。
      const sorted = events
        .map((event, index) => ({
          event,
          index,
          start: timeToMinutes(event.time),
          end: timeToMinutes(event.time) + 60,
          lane: 0,
          laneCount: 1
        }))
        .sort((a, b) => a.start - b.start || a.index - b.index);
      const laneEnds = [];
      sorted.forEach(item => {
        let lane = laneEnds.findIndex(end => end <= item.start);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(item.end);
        } else {
          laneEnds[lane] = item.end;
        }
        item.lane = lane;
      });

      sorted.forEach(item => {
        const checkPoints = [item.start, item.start + 30].filter(minutes => minutes >= item.start && minutes < item.end);
        const activeGroups = checkPoints.map(minutes =>
          sorted
            .filter(candidate => candidate.start <= minutes && minutes < candidate.end)
            .sort((a, b) => a.lane - b.lane || a.start - b.start || a.index - b.index)
        );
        const peakGroup = activeGroups.reduce((peak, group) => group.length > peak.length ? group : peak, []);
        item.laneCount = Math.max(1, peakGroup.length);
        item.lane = Math.max(0, peakGroup.findIndex(candidate => candidate === item));
      });

      return sorted.sort((a, b) => a.index - b.index);
    }

    function updateStickyCalendarOffset() {
      const topbar = document.querySelector(".topbar.calendar-panel:not(.hidden)");
      const offset = topbar && !isMobileCalendarLayout()
        ? Math.max(0, Math.round(topbar.getBoundingClientRect().height))
        : 0;
      document.documentElement.style.setProperty("--calendar-sticky-top", `${offset}px`);
    }

    function renderCalendar() {
      enforceResponsiveCalendarMode();
      const activeTypes = new Set([...calendarTypeFilters.querySelectorAll("input:checked")].map(input => input.value));
      const activeCoach = activeCalendarCoachName();
      const visibleDays = visibleCalendarDays();
      updateCalendarHeader(visibleDays);
      updateStickyCalendarOffset();
      const mobileCalendar = isMobileCalendarLayout();
      const compactDesktopCalendar = !mobileCalendar && window.innerWidth <= 1600;
      const timeColumnWidth = mobileCalendar ? "58px" : "72px";
      const dayColumnMin = mobileCalendar
        ? (calendarViewMode === "three" ? "96px" : "260px")
        : (calendarViewMode === "week" ? (compactDesktopCalendar ? "180px" : "145px") : "210px");
      calendar.style.gridTemplateColumns = `${timeColumnWidth} repeat(${visibleDays.length}, minmax(${dayColumnMin}, 1fr))`;
      const desktopMinWidth = calendarViewMode === "week"
        ? `${Number.parseInt(timeColumnWidth, 10) + (visibleDays.length * Number.parseInt(dayColumnMin, 10))}px`
        : calendarViewMode === "three" ? "720px" : "360px";
      calendar.style.minWidth = mobileCalendar
        ? "100%"
        : desktopMinWidth;
      calendar.innerHTML = "";
      const corner = document.createElement("div");
      corner.className = "corner";
      corner.style.gridColumn = "1";
      corner.style.gridRow = "1";
      corner.innerHTML = `<span>時段</span>`;
      calendar.appendChild(corner);

      visibleDays.forEach((day, dayIndex) => {
        const header = document.createElement("div");
        const dayWeekOffset = day.weekOffset || 0;
        const dayNumber = getDayNumber(day.key, dayWeekOffset);
        const isDayPast = dayNumber < currentCalendarDayNumber();
        const isDayToday = dayNumber === currentCalendarDayNumber();
        header.className = `day-head ${isDayPast ? "past" : ""} ${isDayToday ? "today" : ""}`;
        header.style.gridColumn = String(dayIndex + 2);
        header.style.gridRow = "1";
        header.innerHTML = `
            <strong>${day.label}<span class="mobile-only"> ${shortDateLabel(day.key, dayWeekOffset)}</span></strong>
            <span>${shortDateLabel(day.key, dayWeekOffset)}</span>
          `;
        calendar.appendChild(header);
      });

      times.forEach((time, timeIndex) => {
        const isHalfHour = time.endsWith(":30");
      const isHalfDivider = !isHalfHour;
        const timeCell = document.createElement("div");
        timeCell.className = `time ${isHalfHour ? "half-hour" : ""} ${isHalfDivider ? "half-divider" : ""}`;
        timeCell.style.gridColumn = "1";
        timeCell.style.gridRow = String(timeIndex + 2);
        timeCell.innerHTML = isHalfHour ? "" : `<span>${time}</span>`;
        calendar.appendChild(timeCell);

        visibleDays.forEach((day, dayIndex) => {
          const dayWeekOffset = day.weekOffset || 0;
          const cap = capacityFor(day.key, time, dayWeekOffset);
          const fullClass = cap.general >= 3 ? "full" : "";
          const hasSelectedMember = bookingMemberId ? cap.events.some(event => eventHasMember(event, bookingMemberId)) : false;
          const slotPast = isPastDateTime(day.key, time, dayWeekOffset);
          const dayNumber = getDayNumber(day.key, dayWeekOffset);
          const isDayToday = dayNumber === currentCalendarDayNumber();
          const slot = document.createElement("div");
          slot.className = `slot ${fullClass} ${isHalfDivider ? "half-divider" : ""} ${slotPast ? "past" : ""} ${isDayToday ? "today" : ""} ${hasSelectedMember ? "member-booked" : ""}`;
          slot.style.gridColumn = String(dayIndex + 2);
          slot.style.gridRow = String(timeIndex + 2);
          slot.dataset.day = day.key;
          slot.dataset.time = time;
          slot.dataset.weekOffset = String(dayWeekOffset);
          slot.dataset.occupied = cap.events.length ? "true" : "false";
          slot.dataset.full = cap.general >= 3 ? "true" : "false";
          slot.dataset.past = slotPast ? "true" : "false";
          slot.innerHTML = "";
          calendar.appendChild(slot);
        });
      });

      visibleDays.forEach((day, dayIndex) => {
        const dayWeekOffset = day.weekOffset || 0;
        const dayEvents = bookings.filter(event =>
          event.status !== "cancelled" &&
          event.day === day.key &&
          (event.weekOffset || 0) === dayWeekOffset &&
          activeTypes.has(event.kind) &&
          calendarCoachMatches(event, activeCoach) &&
          times.includes(event.time)
        );
        const arrangedEvents = arrangeBookingLanes(dayEvents);
        arrangedEvents.forEach(item => {
          const { event, lane, laneCount } = item;
          const timeIndex = times.indexOf(event.time);
          const lines = calendarEventLines(event);
          const expired = isPastBooking(event);
          const laneGap = 2;
          const rightReserve = mobileCalendar ? 9 : 14;
          const totalGap = Math.max(0, laneCount - 1) * laneGap;
          const laneWidth = `calc(${100 / laneCount}% - ${(rightReserve + totalGap) / laneCount}px)`;
          const laneOffsetPx = lane * (laneGap - ((rightReserve + totalGap) / laneCount));
          const laneOffset = lane === 0 ? "0" : `calc(${(lane * 100) / laneCount}% + ${laneOffsetPx}px)`;
          const layer = document.createElement("div");
          layer.className = `calendar-event-layer lane-event-layer ${laneCount >= 3 ? "narrow" : ""}`;
          layer.style.gridColumn = String(dayIndex + 2);
          layer.style.gridRow = `${timeIndex + 2} / span 2`;
          layer.style.width = laneWidth;
          layer.style.marginLeft = laneOffset;
          layer.dataset.day = day.key;
          layer.dataset.time = event.time;
          layer.dataset.weekOffset = String(dayWeekOffset);
          const hasStatusBadge = eventHasInstallment(event) || eventNeedsRenew(event);
          layer.innerHTML = `
            <div class="event ${event.kind} ${hasStatusBadge ? "has-status-badge" : ""} ${expired ? "expired" : ""} ${bookingMemberId ? eventHasMember(event, bookingMemberId) ? "selected-member" : "dimmed" : ""}" data-booking-id="${event.id}" data-expired="${expired ? "true" : "false"}" data-day="${day.key}" data-time="${event.time}" data-week-offset="${dayWeekOffset}" data-tooltip-enabled="${laneCount > 1 ? "true" : "false"}" data-tooltip-kind="${event.kind}" data-tooltip-tag="${escapeHtml(lines.tag)}" data-tooltip-member="${escapeHtml(lines.member)}" data-tooltip-coach="${escapeHtml(lines.coach)}" draggable="${expired ? "false" : "true"}">
              <div class="event-tags">${calendarEventTags(event)}</div>
              ${calendarRenewTag(event)}
              ${calendarCheckInStamp(event)}
              <span class="event-course-tag">${lines.tag}</span>
              <span class="event-member-line">${lines.member}</span>
              <span class="event-coach-line">${lines.coach}</span>
            </div>
          `;
          calendar.appendChild(layer);
        });
      });

      const clearDragTargets = () => {
        calendar.querySelectorAll(".slot.drag-target").forEach(item => item.classList.remove("drag-target"));
      };

      let draggedCardPointerOffset = { x: 0, y: 0 };
      let pointerDragState = null;
      let suppressNextBookingClickId = "";

      const slotFromCardCorner = (clientX, clientY, offset = draggedCardPointerOffset) => {
        const cornerX = clientX - offset.x + 2;
        const cornerY = clientY - offset.y + 2;
        if (!Number.isFinite(cornerX) || !Number.isFinite(cornerY) || cornerX < 0 || cornerY < 0) return null;
        return [...calendar.querySelectorAll(".slot")].find(slot => {
          const rect = slot.getBoundingClientRect();
          return cornerX >= rect.left && cornerX < rect.right && cornerY >= rect.top && cornerY < rect.bottom;
        }) || null;
      };

      const markDragTargetFromCardCorner = (clientX, clientY, offset = draggedCardPointerOffset) => {
        const targetSlot = slotFromCardCorner(clientX, clientY, offset);
        clearDragTargets();
        if (targetSlot && targetSlot.dataset.past !== "true") targetSlot.classList.add("drag-target");
        return targetSlot;
      };

      const dropBookingOnTarget = event => {
        event.preventDefault();
        event.stopPropagation();
        calendar.classList.remove("dragging-booking");
        clearDragTargets();
        const targetSlot = slotFromCardCorner(event.clientX, event.clientY);
        if (!targetSlot) return;
        if (targetSlot.dataset.past === "true") {
          showToast("此時段已超過可預約時間。", "error", "不可預約");
          return;
        }
        const bookingId = event.dataTransfer.getData("text/plain");
        if (bookingId) {
          moveBookingToSlot(
            bookingId,
            targetSlot.dataset.day,
            targetSlot.dataset.time,
            Number(targetSlot.dataset.weekOffset) || 0
          );
        }
      };

      const finishPointerDrag = async pointerEvent => {
        if (!pointerDragState) return;
        const state = pointerDragState;
        pointerDragState = null;
        window.removeEventListener("pointermove", trackPointerDrag);
        window.removeEventListener("pointerup", finishPointerDrag);
        calendar.classList.remove("dragging-booking");
        state.eventEl.classList.remove("dragging");
        clearDragTargets();
        if (!state.dragging) return;
        pointerEvent.preventDefault();
        pointerEvent.stopPropagation();
        suppressNextBookingClickId = state.bookingId;
        setTimeout(() => {
          if (suppressNextBookingClickId === state.bookingId) suppressNextBookingClickId = "";
        }, 0);
        const targetSlot = slotFromCardCorner(pointerEvent.clientX, pointerEvent.clientY, state.offset);
        if (!targetSlot) return;
        if (targetSlot.dataset.past === "true") {
          showToast("此時段已超過可預約時間。", "error", "不可預約");
          return;
        }
        await moveBookingToSlot(
          state.bookingId,
          targetSlot.dataset.day,
          targetSlot.dataset.time,
          Number(targetSlot.dataset.weekOffset) || 0
        );
      };

      function trackPointerDrag(pointerEvent) {
        if (!pointerDragState) return;
        const moved = Math.abs(pointerEvent.clientX - pointerDragState.startX) + Math.abs(pointerEvent.clientY - pointerDragState.startY);
        if (moved < 8) return;
        pointerDragState.dragging = true;
        pointerEvent.preventDefault();
        calendar.classList.add("dragging-booking");
        pointerDragState.eventEl.classList.add("dragging");
        markDragTargetFromCardCorner(pointerEvent.clientX, pointerEvent.clientY, pointerDragState.offset);
      }

      calendar.querySelectorAll("[data-booking-id]").forEach(eventEl => {
        eventEl.addEventListener("mouseenter", pointerEvent => {
          showCursorCardTooltip(eventEl, pointerEvent);
        });
        eventEl.addEventListener("mousemove", pointerEvent => {
          moveCursorCardTooltip(pointerEvent);
        });
        eventEl.addEventListener("mouseleave", hideCursorCardTooltip);
        eventEl.addEventListener("dragstart", dragEvent => {
          hideCursorCardTooltip();
          if (eventEl.dataset.expired === "true") {
            dragEvent.preventDefault();
            return;
          }
          const rect = eventEl.getBoundingClientRect();
          draggedCardPointerOffset = {
            x: Math.max(0, dragEvent.clientX - rect.left),
            y: Math.max(0, dragEvent.clientY - rect.top)
          };
          calendar.classList.add("dragging-booking");
          eventEl.classList.add("dragging");
          dragEvent.dataTransfer.setData("text/plain", eventEl.dataset.bookingId);
          dragEvent.dataTransfer.effectAllowed = "move";
          dragEvent.dataTransfer.setDragImage(eventEl, draggedCardPointerOffset.x, draggedCardPointerOffset.y);
        });
        eventEl.addEventListener("dragover", dragEvent => {
          if (eventEl.dataset.expired === "true") return;
          dragEvent.preventDefault();
          dragEvent.stopPropagation();
          markDragTargetFromCardCorner(dragEvent.clientX, dragEvent.clientY);
        });
        eventEl.addEventListener("drop", dropBookingOnTarget);
        eventEl.addEventListener("dragend", () => {
          calendar.classList.remove("dragging-booking");
          eventEl.classList.remove("dragging");
          clearDragTargets();
        });
        eventEl.addEventListener("pointerdown", pointerEvent => {
          if (pointerEvent.button !== 0 || eventEl.dataset.expired === "true") return;
          const rect = eventEl.getBoundingClientRect();
          pointerDragState = {
            bookingId: eventEl.dataset.bookingId,
            eventEl,
            startX: pointerEvent.clientX,
            startY: pointerEvent.clientY,
            offset: {
              x: Math.max(0, pointerEvent.clientX - rect.left),
              y: Math.max(0, pointerEvent.clientY - rect.top)
            },
            dragging: false
          };
          window.addEventListener("pointermove", trackPointerDrag);
          window.addEventListener("pointerup", finishPointerDrag);
        });
        eventEl.addEventListener("click", clickEvent => {
          hideCursorCardTooltip();
          clickEvent.stopPropagation();
          if (suppressNextBookingClickId === eventEl.dataset.bookingId) {
            suppressNextBookingClickId = "";
            return;
          }
          openBookingDetail(eventEl.dataset.bookingId);
        });
      });

      calendar.querySelectorAll(".calendar-event-layer").forEach(layer => {
        layer.addEventListener("dragover", dragEvent => {
          dragEvent.preventDefault();
          markDragTargetFromCardCorner(dragEvent.clientX, dragEvent.clientY);
        });
        layer.addEventListener("drop", dropBookingOnTarget);
        layer.addEventListener("click", event => {
          if (event.target.closest("[data-booking-id]")) return;
          const weekOffset = Number(layer.dataset.weekOffset) || 0;
          if (isPastDateTime(layer.dataset.day, layer.dataset.time, weekOffset)) {
            showToast("此時段已超過可預約時間。", "error", "不可預約");
            return;
          }
          resetBookingForm(layer.dataset.day, layer.dataset.time, weekOffset);
          appRoot.classList.add("booking-panel-open");
          updatePreview();
        });
      });

      calendar.querySelectorAll("[data-add-slot-day]").forEach(button => {
        button.addEventListener("click", event => {
          event.stopPropagation();
          resetBookingForm(button.dataset.addSlotDay, button.dataset.addSlotTime, Number(button.dataset.addSlotWeek) || 0);
          appRoot.classList.add("booking-panel-open");
          updatePreview();
        });
      });

      calendar.querySelectorAll(".slot").forEach(slot => {
        slot.addEventListener("dragover", event => {
          if (slot.dataset.past === "true") return;
          event.preventDefault();
          markDragTargetFromCardCorner(event.clientX, event.clientY);
        });
        slot.addEventListener("dragleave", () => {
          slot.classList.remove("drag-target");
        });
        slot.addEventListener("drop", event => {
          event.preventDefault();
          calendar.classList.remove("dragging-booking");
          clearDragTargets();
          const targetSlot = slotFromCardCorner(event.clientX, event.clientY);
          if (!targetSlot) return;
          if (targetSlot.dataset.past === "true") {
            showToast("此時段已超過可預約時間。", "error", "不可預約");
            return;
          }
          const bookingId = event.dataTransfer.getData("text/plain");
          if (bookingId) moveBookingToSlot(bookingId, targetSlot.dataset.day, targetSlot.dataset.time, Number(targetSlot.dataset.weekOffset) || 0);
        });
        slot.addEventListener("click", async () => {
          if (slot.dataset.past === "true") {
            showToast("此時段已超過可預約時間。", "error", "不可預約");
            return;
          }
          resetBookingForm(slot.dataset.day, slot.dataset.time, Number(slot.dataset.weekOffset) || 0);
          appRoot.classList.add("booking-panel-open");
          updatePreview();
        });
      });

      updateMetrics();
    }

    function ticketUsageCourseLabel(record, member) {
      const key = String(record?.planKey || "");
      const source = `${key} ${record?.typeLabel || ""} ${member.plan || ""}`;
      const isFriendly = source.includes("friendly") || source.includes("友善");
      const isPair = record?.peoplePlan === "1v2" || coursePeopleLabel(key) === "1v2" || source.includes("1V2") || source.includes("1v2");
      return `${isFriendly ? "友善" : "教練"}${isPair ? "2" : "1"}`;
    }

    function ticketTypeShortLabel(type) {
      if (type === "course") return "教練課";
      if (type === "group") return "團體課";
      if (type === "selfTraining") return "自主訓練";
      if (type === "friendlySelfTraining") return "友善自主";
      if (type === "massage") return "運動按摩";
      return "票券";
    }

    function ticketUsageRow(bucket, extraClass = "") {
      const label = displayTicketLabel(bucket.label || ticketTypeShortLabel(bucket.type));
      const used = bucket.used || 0;
      const remaining = bucket.remaining || 0;
      const total = bucket.total || 0;
      const expiry = bucket.expiry ? `<small class="ticket-usage-expiry">到期 ${escapeHtml(bucket.expiry)}</small>` : "";
      const latestAdjustment = (bucket.adjustmentHistory || [])[0];
      const adjustmentText = latestAdjustment
        ? [latestAdjustment.reason || "手動調整", latestAdjustment.note || latestAdjustment.description || ""].filter(Boolean).join("｜")
        : "";
      const rowClasses = [
        bucket.needsRenew ? "renew-needed" : "",
        bucket.invalid ? "ticket-invalid" : "",
        latestAdjustment ? "ticket-adjusted" : ""
      ].filter(Boolean).join(" ");
      return `
        <div class="ticket-usage-row ${rowClasses}" data-ticket-bucket-id="${bucket.id || ""}">
          <button class="ticket-edit-btn" type="button" data-edit-ticket-bucket="${bucket.id || ""}" aria-label="調整${escapeHtml(label)}票券" title="調整票券">⚙</button>
          <span class="ticket-usage-label-wrap">
            <span class="ticket-usage-label ${extraClass}">${escapeHtml(label)}</span>
            ${latestAdjustment ? `<small class="ticket-adjusted-badge">異動</small>` : ""}
            ${expiry}
            ${adjustmentText ? `<small class="ticket-usage-note">${escapeHtml(adjustmentText)}</small>` : ""}
          </span>
          <span class="ticket-usage-value">${used}</span>
          <span class="ticket-usage-value">${remaining}</span>
          <span class="ticket-usage-value">${total}</span>
        </div>
      `;
    }

    function ticketBucketExpiryForMember(member, bucket) {
      if (!bucket) return "";
      if (bucket.expiry) return bucket.expiry;
      const key = bucket.type === "selfTraining" ? "selfTraining" : bucket.type;
      return member.ticketExpiry?.[key] || "";
    }

    function normalizedDateValue(dateText = "") {
      const normalized = String(dateText || "").trim().replaceAll("/", "-");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
      return normalized;
    }

    function isTicketBucketInvalid(member, bucket) {
      const remaining = Number(bucket?.remaining) || 0;
      const expiry = normalizedDateValue(ticketBucketExpiryForMember(member, bucket));
      const expired = expiry ? expiry < dateInputValue(todayDateSlash()) : false;
      return remaining <= 0 || expired;
    }

    function renderTicketFilterTabs() {
      const items = [
        ["all", "全部票券"],
        ["valid", "有效票券"],
        ["invalid", "無效票券"]
      ];
      return `
        <div class="ticket-filter-tabs" data-ticket-filter-tabs>
          ${items.map(([value, label]) => `
            <button type="button" class="${memberCardTicketFilter === value ? "active" : ""}" data-member-card-ticket-filter="${value}">${label}</button>
          `).join("")}
        </div>
      `;
    }

    function renewalTicketRowsForMember(member, existingLabels = new Set()) {
      const rows = [];
      const seen = new Set();
      getMemberEvents(member.id).forEach(event => {
        if (!isFinalBookingProgress(member, event)) return;
        const label = displayTicketLabel(courseShortTag(event));
        if (existingLabels.has(label) || seen.has(label)) return;
        seen.add(label);
        const { index, total } = memberBookingProgressNumbers(member, event);
        rows.push(ticketUsageRow({
          id: `renew-${member.id}-${event.id}`,
          label,
          used: index || total || 0,
          remaining: 0,
          total: total || index || 0,
          needsRenew: true
        }, "renew"));
      });
      return rows;
    }

    function renderMemberTicketUsage(member) {
      const rows = [];
      const shownLabels = new Set();
      syncWalletFromBuckets(member);
      (member.ticketBuckets || []).forEach(bucket => {
        const invalid = isTicketBucketInvalid(member, bucket);
        if (memberCardTicketFilter === "valid" && invalid) return;
        if (memberCardTicketFilter === "invalid" && !invalid) return;
        const label = displayTicketLabel(bucket.label || ticketTypeShortLabel(bucket.type));
        shownLabels.add(label);
        const extraClass = ticketBucketPaletteClass(bucket);
        rows.push(ticketUsageRow({
          ...bucket,
          invalid,
          expiry: ticketBucketExpiryForMember(member, bucket)
        }, extraClass));
      });
      if (memberCardTicketFilter !== "invalid") rows.push(...renewalTicketRowsForMember(member, shownLabels));
      const emptyText = memberCardTicketFilter === "valid"
        ? "目前沒有有效票券"
        : memberCardTicketFilter === "invalid"
          ? "目前沒有無效票券"
          : "目前沒有票券";
      return rows.length ? rows.join("") : `<div class="ticket-usage-empty">${emptyText}</div>`;
    }

    function ticketBucketLabelOptions() {
      return ["教練1V1", "教練1V2", "友善1V1", "友善1V2", "團課", "自主", "友善自主", "按摩", "贈送課", "贈送團課"];
    }

    function ticketTypeFromLabel(label, fallback = "course") {
      if (label.includes("團")) return "group";
      if (label.includes("友善自主")) return "friendlySelfTraining";
      if (label.includes("自")) return "selfTraining";
      if (label.includes("按")) return "massage";
      return fallback;
    }

    function estimateTicketUnitValue(bucket) {
      if (Number(bucket.unitValue) > 0) return Number(bucket.unitValue);
      const label = bucket.label || "";
      if (bucket.type === "massage" || label.includes("按")) return 1500;
      if (bucket.type === "selfTraining" || bucket.type === "friendlySelfTraining" || label.includes("自")) return 0;
      if (bucket.type === "group" || label.includes("團")) return 500;
      if (label.includes("友善1V2") || label.includes("友善2")) return 1600;
      if (label.includes("友善")) return 1300;
      if (label.includes("教練1V2") || label.includes("教練2")) return 1800;
      if (label.includes("教練")) return 1500;
      return 0;
    }

    function updateTicketAdjustmentPreview(row) {
      const sessionsInput = row.querySelector("[data-ticket-refund-sessions]");
      const refundInput = row.querySelector("[data-ticket-edit-refund]");
      const unitValue = Number(row.dataset.ticketUnitValue) || 0;
      const remainingSessions = Number(row.dataset.ticketRemainingSessions) || 0;
      const returnSessions = Math.min(remainingSessions, Math.max(0, Number(sessionsInput?.value) || 0));
      if (sessionsInput && Number(sessionsInput.value) !== returnSessions) sessionsInput.value = String(returnSessions);
      const creditOutput = row.querySelector("[data-ticket-edit-credit]");
      const refundValueOutput = row.querySelector("[data-ticket-refund-value]");
      const refundValue = Math.round(returnSessions * unitValue);
      const refund = Math.min(refundValue, Math.max(0, Number(refundInput?.value) || 0));
      if (refundInput && Number(refundInput.value) !== refund) refundInput.value = String(refund);
      if (refundValueOutput) refundValueOutput.textContent = money(refundValue);
      if (creditOutput) creditOutput.textContent = money(Math.max(0, refundValue - refund));
    }

    function renderTicketBucketEditor(member, bucket, rerender) {
      const row = memberDetailProfile.querySelector(`[data-ticket-bucket-id="${bucket.id}"]`);
      if (!row) return;
      row.classList.add("editing");
      const unitValue = estimateTicketUnitValue(bucket);
      const remainingSessions = Math.max(0, Number(bucket.remaining) || 0);
      const remainingValue = Math.round(remainingSessions * unitValue);
      const defaultRefundSessions = Math.min(1, remainingSessions);
      const defaultRefundAmount = Math.round(defaultRefundSessions * unitValue);
      row.dataset.ticketUnitValue = String(unitValue);
      row.dataset.ticketRemainingSessions = String(remainingSessions);
      row.innerHTML = `
        <div class="ticket-adjust-summary">
          <div>
            <span>目前剩餘堂數</span>
            <strong>${remainingSessions}</strong>
          </div>
          <div>
            <span>目前剩餘金額</span>
            <strong>${money(remainingValue)}</strong>
          </div>
        </div>
        <div class="ticket-edit-grid">
          <label>退的堂數
            <input data-ticket-refund-sessions type="number" min="0" max="${remainingSessions}" step="1" value="${defaultRefundSessions}">
          </label>
          <label>退款金額
            <input data-ticket-edit-refund type="number" min="0" step="1" value="${defaultRefundAmount}">
          </label>
          <label>異動原因
            <select data-ticket-edit-reason>
              <option value="系統調整">系統調整</option>
              <option value="延長效期">延長效期</option>
              <option value="補發票券">補發票券</option>
              <option value="扣除錯誤修正">扣除錯誤修正</option>
              <option value="手動新增">手動新增</option>
            </select>
          </label>
          <label>異動說明
            <input data-ticket-edit-note type="text" placeholder="例如：櫃台修正、客服確認">
          </label>
        </div>
        <div class="ticket-adjust-preview">
          <strong>本次退堂價值：<span data-ticket-refund-value>${money(defaultRefundAmount)}</span></strong>
          <strong>會員儲值金額：<span data-ticket-edit-credit>${money(0)}</span></strong>
          <span>例如退 1 堂價值 100，退款填 0，這 100 會記到會員資料的儲值金額。</span>
        </div>
        <div class="inline-edit-actions">
          <button type="button" data-ticket-edit-cancel>取消</button>
          <button type="button" data-ticket-edit-save>儲存</button>
        </div>
      `;
      row.querySelector("[data-ticket-refund-sessions]")?.addEventListener("input", () => {
        const sessions = Math.min(remainingSessions, Math.max(0, Number(row.querySelector("[data-ticket-refund-sessions]")?.value) || 0));
        const refundInput = row.querySelector("[data-ticket-edit-refund]");
        if (refundInput) refundInput.value = String(Math.round(sessions * unitValue));
        updateTicketAdjustmentPreview(row);
      });
      row.querySelector("[data-ticket-edit-refund]")?.addEventListener("input", () => updateTicketAdjustmentPreview(row));
      row.querySelector("[data-ticket-edit-cancel]")?.addEventListener("click", event => {
        event.stopPropagation();
        rerender();
      });
      row.querySelector("[data-ticket-edit-save]")?.addEventListener("click", async event => {
        event.stopPropagation();
        const refundSessions = Math.min(remainingSessions, Math.max(0, Number(row.querySelector("[data-ticket-refund-sessions]")?.value) || 0));
        const refundValue = Math.round(refundSessions * unitValue);
        const refundAmount = Math.max(0, Number(row.querySelector("[data-ticket-edit-refund]")?.value) || 0);
        const adjustmentReason = row.querySelector("[data-ticket-edit-reason]")?.value || "系統調整";
        const adjustmentNote = String(row.querySelector("[data-ticket-edit-note]")?.value || "").trim();
        if (refundAmount > refundValue) {
          formMessage.className = "message error";
          formMessage.textContent = "退款金額不能大於本次退堂價值。";
          return;
        }
        if (refundSessions <= 0 && refundAmount <= 0) {
          formMessage.className = "message error";
          formMessage.textContent = "請先輸入要退的堂數。";
          return;
        }
        const retainedCredit = Math.max(0, refundValue - refundAmount);
        if (!(await confirmChange([
          "確認退堂調整",
          `會員：${member.name}`,
          `票券：${displayTicketLabel(bucket.label || "票券")}`,
          `退堂：${refundSessions} 堂`,
          `退款：${money(refundAmount)}`,
          `轉入會員儲值金：${money(retainedCredit)}`,
          `原因：${adjustmentReason}${adjustmentNote ? `｜${adjustmentNote}` : ""}`
        ].join("\n")))) return;
        const previousSnapshot = {
          label: bucket.label,
          type: bucket.type,
          total: bucket.total,
          remaining: bucket.remaining
        };
        bucket.remaining = Math.max(0, remainingSessions - refundSessions);
        bucket.used = Math.max(0, (bucket.used || 0) + refundSessions);
        bucket.adjustmentValue = Math.max(0, Math.round(bucket.remaining * unitValue));
        bucket.lastRefundAmount = refundAmount;
        bucket.lastRetainedCredit = retainedCredit;
        bucket.adjustmentHistory = bucket.adjustmentHistory || [];
        bucket.adjustmentHistory.unshift({
          date: todayDateSlash(),
          previous: previousSnapshot,
          next: {
            label: bucket.label,
            type: bucket.type,
            total: bucket.total,
            remaining: bucket.remaining
          },
          refundSessions,
          refundValue,
          refundAmount,
          retainedCredit,
          reason: adjustmentReason,
          note: adjustmentNote
        });
        if (retainedCredit > 0) {
          member.storeCredit = Math.max(0, Number(member.storeCredit) || 0) + retainedCredit;
        }
        member.refundHistory = member.refundHistory || [];
        if (refundAmount > 0 || retainedCredit > 0) {
          member.refundHistory.unshift({
            date: todayDateSlash(),
            ticketLabel: previousSnapshot.label || bucket.label,
            refundSessions,
            refundValue,
            refundAmount,
            retainedCredit,
            reason: adjustmentReason,
            note: adjustmentNote
          });
        }
        syncWalletFromBuckets(member);
        saveAppData();
        renderMemberDirectory();
        renderMemberSelect();
        renderProfileSelect();
        rerender();
      });
    }

    function bindTicketEditControls(member, rerender) {
      memberDetailProfile.querySelectorAll("[data-edit-ticket-bucket]").forEach(button => {
        button.addEventListener("click", event => {
          event.stopPropagation();
          const bucket = (member.ticketBuckets || []).find(item => item.id === button.dataset.editTicketBucket);
          if (!bucket) return;
          renderTicketBucketEditor(member, bucket, rerender);
        });
      });
    }

    function bindMemberCardTicketFilter(rerender) {
      memberDetailProfile.querySelectorAll("[data-member-card-ticket-filter]").forEach(button => {
        button.addEventListener("click", event => {
          event.stopPropagation();
          memberCardTicketFilter = button.dataset.memberCardTicketFilter || "all";
          rerender();
        });
      });
    }

    function validateSelection(weekOffset = 0, dayKey = bookingDay.value, time = bookingTime.value, excludeBookingId = "") {
      // 新增預約前的主要防呆：過期時段、容量、團課、教練衝堂、友善課時段。
      const plan = getPlanInfo(bookingType.value);
      const windowCaps = bookingWindowCapacities(dayKey, time, weekOffset, excludeBookingId);
      const maxGeneral = Math.max(...windowCaps.map(item => item.cap.general), 0);
      const maxGroup = Math.max(...windowCaps.map(item => item.cap.group), 0);

      if (isPastDateTime(dayKey, time, weekOffset)) {
        return { ok: false, message: "已過期的時段不能新增預約。" };
      }

      const coachConflict = plan.kind !== "self"
        ? bookingCoachConflict(dayKey, time, weekOffset, coachName.value, excludeBookingId)
        : null;
      if (coachConflict) {
        return { ok: false, message: coachConflictMessage(coachConflict, coachName.value) };
      }

      if (plan.kind === "friendly" && !isFriendlyAvailable(dayKey, time)) {
        return { ok: false, message: "友善教練課只能安排在平日 09:00 到 18:00。" };
      }

      if (plan.kind === "group") {
        if (plan.people > 5) return { ok: false, message: "小班團課最多 5 人。" };
        if (maxGroup >= 1) return { ok: false, message: "這 60 分鐘內已經有小班團體課，不能再開第二組。" };
        return { ok: true, message: "可以建立 60 分鐘小班團課。可先排空班，之後再由客人或櫃台加入學員，最多 5 人。" };
      }

      if (maxGeneral + plan.general > 3) {
        return { ok: false, message: "這 60 分鐘內的一般容量已滿，教練課、友善教練課和自主訓練都不能再新增。" };
      }

      return { ok: true, message: "可以建立 60 分鐘預約。這筆會占用一般容量 1 組。" };
    }

    function validateBookingMove(booking, dayKey, time, weekOffset = booking.weekOffset || 0, excludeBookingId = booking.id) {
      // 拖移小卡時沿用相同規則；失敗時只顯示右下角提示，不跳確認視窗。
      if (isPastBooking(booking)) {
        return { ok: false, message: "這筆預約已過期，不能拖拉改時間，只能刪除。" };
      }
      if (isPastDateTime(dayKey, time, weekOffset)) {
        return { ok: false, message: "不能把預約移到已過期的時段。" };
      }
      const windowCaps = bookingWindowCapacities(dayKey, time, weekOffset, excludeBookingId);
      const maxGeneral = Math.max(...windowCaps.map(item => item.cap.general), 0);
      const maxGroup = Math.max(...windowCaps.map(item => item.cap.group), 0);
      const coachConflict = booking.kind !== "self"
        ? bookingCoachConflict(dayKey, time, weekOffset, bookingCoachName(booking), excludeBookingId)
        : null;
      if (coachConflict) {
        return { ok: false, message: coachConflictMessage(coachConflict, bookingCoachName(booking)) };
      }
      if (booking.kind === "friendly" && !isFriendlyAvailable(dayKey, time)) {
        return { ok: false, message: "友善教練課只能安排在平日 09:00 到 18:00。" };
      }
      if (booking.kind === "group" && maxGroup + booking.groupSlot > 1) {
        return { ok: false, message: "這 60 分鐘內已經有小班團體課。" };
      }
      if (booking.kind !== "group" && maxGeneral + booking.general > 3) {
        return { ok: false, message: "這 60 分鐘內的一般容量已滿。" };
      }
      return { ok: true, message: "可以移動預約。" };
    }

    function bookingDateTimeValue(booking) {
      return (getBookingDayNumber(booking) * 1440) + timeToMinutes(booking.time);
    }

    function dayInfoFromNumber(dayNumber) {
      return calendarDayFromOffset(dayNumber - 18);
    }

    function followingSeriesBookings(booking) {
      if (!booking.seriesId) return [];
      const baseValue = bookingDateTimeValue(booking);
      const hasExplicitSlot = Boolean(booking.seriesSlotNumber);
      return bookings
        .filter(item =>
          item.seriesId === booking.seriesId &&
          item.status !== "cancelled" &&
          (
            hasExplicitSlot
              ? (item.seriesSlotNumber ? item.seriesSlotNumber === booking.seriesSlotNumber : item.day === booking.day)
              : item.day === booking.day
          ) &&
          bookingDateTimeValue(item) >= baseValue
        )
        .sort((a, b) => bookingDateTimeValue(a) - bookingDateTimeValue(b));
    }

    function buildSeriesMoveTargets(booking, dayKey, time, weekOffset) {
      const dayDelta = getDayNumber(dayKey, weekOffset) - getBookingDayNumber(booking);
      const affected = followingSeriesBookings(booking);
      return affected.map(item => {
        const target = dayInfoFromNumber(getBookingDayNumber(item) + dayDelta);
        return { booking: item, day: target.key, weekOffset: target.weekOffset, time };
      });
    }

    function validateSeriesMoveTargets(targets) {
      const excludeIds = targets.map(item => item.booking.id);
      for (const target of targets) {
        const validation = validateBookingMove(target.booking, target.day, target.time, target.weekOffset, excludeIds);
        if (!validation.ok) {
          return { ok: false, message: `${formatBookingDate(target.booking)} ${target.booking.time}：${validation.message}` };
        }
      }
      return { ok: true, message: "" };
    }

    async function chooseSeriesMoveScope(booking) {
      const originalAcceptText = acceptConfirmBtn.textContent;
      const originalCancelText = cancelConfirmBtn.textContent;
      acceptConfirmBtn.textContent = "一併變更";
      cancelConfirmBtn.textContent = "單堂變更";
      try {
        return await confirmChange([
          "這是固定預約",
          `目前移動：${bookingMemberNames(booking)} ${formatBookingDate(booking)} ${booking.time}`,
          "",
          "單堂變更：只移動這一堂。",
          "一併變更：只移動同一個固定日後續課程；若一週兩天固定課，不會連另一個固定日一起移動。"
        ].join("\n"));
      } finally {
        acceptConfirmBtn.textContent = originalAcceptText;
        cancelConfirmBtn.textContent = originalCancelText;
      }
    }

    async function moveBookingToSlot(bookingId, dayKey, time, weekOffset = calendarWeekOffset) {
      const booking = bookings.find(item => item.id === bookingId);
      if (!booking) return;
      const followSeries = booking.seriesId
        ? await chooseSeriesMoveScope(booking)
        : false;
      const targets = followSeries ? buildSeriesMoveTargets(booking, dayKey, time, weekOffset) : [{ booking, day: dayKey, time, weekOffset }];
      const validation = followSeries ? validateSeriesMoveTargets(targets) : validateBookingMove(booking, dayKey, time, weekOffset);
      if (!validation.ok) {
        showToast(validation.message, "error");
        return;
      }
      targets.forEach(target => {
        target.booking.day = target.day;
        target.booking.time = target.time;
        target.booking.weekOffset = target.weekOffset;
      });
      saveAppData();
      renderCalendar();
      renderMemberProfile();
      addActivity("移動", followSeries
        ? `${bookingMemberNames(booking)} 固定預約後續 ${targets.length} 筆已移動`
        : `${bookingMemberNames(booking)} 移到 ${dayKey} ${time}`);
      showToast(followSeries ? `已移動後續 ${targets.length} 筆固定預約。` : "預約時間已移動。", "success");
    }

    function getRepeatCount() {
      if (!repeatBooking.checked) return 1;
      const plan = getPlanInfo(bookingType.value);
      const member = getSelectedMember();
      if (plan.kind === "trial") return 1;
      if (usesCourseTicket(plan) && !member) return 1;
      if (plan.kind === "self" && !member) return Math.max(1, Number(ticketCount.value) || 1);
      return Number(ticketCount.value);
    }

    function getWeeklyFrequency() {
      return repeatBooking.checked ? Number(weeklyFrequency.value) : 1;
    }

    function getSeriesOccurrences() {
      const count = getRepeatCount();
      const frequency = getWeeklyFrequency();
      const occurrences = [];

      for (let index = 0; index < count; index += 1) {
        const useSecondSlot = frequency === 2 && index % 2 === 1;
        const baseOffset = bookingWeekOffset + (frequency === 2 ? Math.floor(index / 2) : index);
        occurrences.push({
          weekOffset: useSecondSlot ? secondSlotWeekOffset(secondBookingDay.value, baseOffset) : baseOffset,
          day: useSecondSlot ? secondBookingDay.value : bookingDay.value,
          time: useSecondSlot ? secondBookingTime.value : bookingTime.value,
          slotNumber: useSecondSlot ? 2 : 1
        });
      }

      return occurrences;
    }

    function validateSeries() {
      const occurrences = getSeriesOccurrences();
      const conflicts = [];
      const seen = new Set();
      const plan = getPlanInfo(bookingType.value);
      const member = getSelectedMember();
      const availableTickets = availableBookingTickets(member, plan);
      const groupMembers = selectedGroupMembers();

      if (plan.kind === "group") {
        if (groupMembers.length > 5) {
          return {
            ok: false,
            conflicts,
            message: "小班團課最多 5 人。"
          };
        }
        const missingTicket = groupMembers.find(item => availableBookingTickets(item, plan) < occurrences.length);
        if (missingTicket) {
          return {
            ok: false,
            conflicts,
            message: `${missingTicket.name} 的團課票券不足，無法建立 ${occurrences.length} 堂預約。`
          };
        }
      }

      if (plan.kind !== "trial" && plan.kind !== "group" && !member) {
        return {
          ok: false,
          conflicts,
          message: "請先選擇會員，體驗課以外的預約都必須綁定會員。"
        };
      }

      if (plan.kind === "self" && member) {
        const regularTickets = Math.max(0, Number(member.ticketWallet.selfTraining) || 0);
        const friendlyTickets = Math.max(0, Number(member.ticketWallet.friendlySelfTraining) || 0);
        const regularNeeded = occurrences.filter(item => !friendlySelfTrainingUsable(item.day, item.time)).length;
        if (regularNeeded > regularTickets) {
          return {
            ok: false,
            conflicts,
            message: `${member.name} 的友善自主只能在平日離峰使用，這個時段需要一般自主訓練票券。`
          };
        }
        if (occurrences.length > regularTickets + friendlyTickets) {
          return {
            ok: false,
            conflicts,
            message: `${member.name} 自主訓練票券不足，無法建立 ${occurrences.length} 筆預約。`
          };
        }
      }

      if (plan.kind !== "trial" && plan.kind !== "group" && plan.kind !== "self" && availableTickets <= 0) {
        return {
          ok: false,
          conflicts,
          message: `${member.name} 目前沒有可用${bookingTicketLabel(plan)}，請先儲值或選擇其他會員。`
        };
      }

      if (plan.kind !== "trial" && plan.kind !== "group" && plan.kind !== "self" && occurrences.length > availableTickets) {
        return {
          ok: false,
          conflicts,
          message: `${member.name} 的${bookingTicketLabel(plan)}只剩 ${availableTickets} 堂，不能建立 ${occurrences.length} 堂預約。`
        };
      }

      if (repeatBooking.checked && occurrences.length < 1) {
        return {
          ok: false,
          conflicts,
          message: "此會員沒有可用票券，不能建立固定預約。"
        };
      }

      for (const occurrence of occurrences) {
        const key = `${occurrence.weekOffset}-${occurrence.day}-${occurrence.time}`;
        if (seen.has(key)) {
          conflicts.push({ occurrence, message: "同一週的兩次固定預約不能選在完全相同的時段。" });
          continue;
        }
        seen.add(key);

        const validation = validateSelection(occurrence.weekOffset, occurrence.day, occurrence.time);
        if (!validation.ok) {
          conflicts.push({ occurrence, message: validation.message });
        }
      }

      if (conflicts.length > 0) {
        const first = conflicts[0];
        const day = days.find(item => item.key === first.occurrence.day);
        return {
          ok: false,
          conflicts,
          message: `第 ${first.occurrence.weekOffset + 1} 週 ${day.label} ${first.occurrence.time} 無法建立：${first.message}`
        };
      }

      if (occurrences.length > 1) {
        const weeks = Math.ceil(occurrences.length / getWeeklyFrequency());
        return { ok: true, conflicts, message: `可以建立 ${occurrences.length} 堂固定預約，約 ${weeks} 週完成。` };
      }

      return validateSelection(bookingWeekOffset);
    }

    function updateRepeatPreview() {
      const count = getRepeatCount();
      const frequency = getWeeklyFrequency();
      const weeks = Math.ceil(count / frequency);
      repeatCard.classList.toggle("active", repeatBooking.checked);
      repeatCard.classList.toggle("twice", repeatBooking.checked && frequency === 2);
      renderSecondBookingDayOptions(secondBookingDay.value);
      submitBooking.textContent = repeatBooking.checked
        ? frequency === 1
          ? `建立 ${count} 週固定預約`
          : `建立 ${count} 堂固定預約`
        : "建立預約";
      repeatSummary.textContent = repeatBooking.checked
        ? frequency === 1
          ? `有 ${count} 堂有效票券，一週一次會建立 ${count} 週固定預約。送出前會逐週檢查容量。`
          : `有 ${count} 堂有效票券，一週兩次會建立 ${count} 次固定預約，約 ${weeks} 週完成。送出前會逐筆檢查容量。`
        : "開啟後可一次建立固定每週同時段預約。";
    }

    function buildBooking(occurrence, seriesId) {
      const plan = getPlanInfo(bookingType.value);
      const member = getSelectedMember();
      const groupMembers = selectedGroupMembers();
      const detailName = member ? member.name : "未指定會員";
      const groupNames = groupMembers.map(item => item.name).join("、") || "未指定學員";
      const detail = plan.kind === "self"
        ? detailName
        : `${detailName} / ${coachName.value}`;
      const groupDetail = `${plan.title} / ${coachName.value}，${groupNames}，${groupMembers.length}/5 人`;

      return {
        day: occurrence.day,
        time: occurrence.time,
        id: `booking-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        memberIds: plan.kind === "group" ? groupMembers.map(item => item.id) : (member ? [member.id] : []),
        weekOffset: occurrence.weekOffset,
        seriesId,
        status: "booked",
        note: "",
        seriesSlotNumber: occurrence.slotNumber,
        kind: plan.kind,
        title: plan.title,
        detail: plan.kind === "group" ? groupDetail : detail,
        people: plan.kind === "group" ? groupMembers.length : plan.people,
        general: plan.general,
        groupSlot: plan.groupSlot,
        checkIns: [],
        checkedIn: false
      };
    }

    function renderSeriesList(createdBookings) {
      if (!createdBookings || createdBookings.length <= 1) return;
      const member = getSelectedMember();
      if (!member) {
        renderMemberMonthCalendar();
        return;
      }
      const frequency = getWeeklyFrequency();
      const weeks = Math.ceil(createdBookings.length / frequency);
      const item = document.createElement("div");
      item.className = "series-item";
      item.innerHTML = `
        <strong>${member.name}，${frequency === 1 ? "一週一次" : "一週兩次"}</strong>
        已用 ${createdBookings.length} 堂有效票券建立固定預約，約 ${weeks} 週完成。此週曆先顯示第 1 週，其餘週次保留在預約資料中。
      `;
      seriesList.prepend(item);
    }

    function updatePreview() {
      const dayKey = bookingDay.value;
      const time = bookingTime.value;
      const cap = capacityFor(dayKey, time, bookingWeekOffset);
      syncTicketCount();
      updateRepeatPreview();
      updateTicketPreview();

      document.querySelector("#generalPreview").textContent = `${cap.general}/3`;
      document.querySelector("#groupPreview").textContent = `${cap.group}/1`;
      document.querySelector("#friendlyPreview").textContent = isFriendlyAvailable(dayKey, time) ? "是" : "否";

      if (bookingFormStep === "basic") {
        formMessage.className = "message";
        formMessage.textContent = "下一步再選會員、日期、時間與重複預約條件。";
        if (bookingStepSummary) {
          bookingStepSummary.innerHTML = `
            <strong>${escapeHtml(selectedBookingCourseLabel())}</strong>
            <span>${escapeHtml(selectedBookingCoachSummary())}</span>
          `;
        }
        return;
      }

      const validation = validateSeries();
      formMessage.className = validation.ok ? "message" : "message error";
      formMessage.textContent = validation.message;
    }

    function updatePeopleByType() {
      syncCoachFieldState();
      const type = bookingType.value;
      const isGroup = type === "small-group";
      if (type.endsWith("1v1") || type === "self-training" || type === "trial-class") peopleCount.value = "1";
      if (type.endsWith("1v2")) peopleCount.value = "2";
      if (isGroup) peopleCount.value = String(groupBookingMemberIds.length);
      peopleCount.disabled = true;
      if (repeatCard) {
        repeatCard.style.display = isGroup ? "none" : "";
        if (isGroup) repeatBooking.checked = false;
      }
      const memberLabel = memberSelect?.closest(".field")?.querySelector("label");
      if (memberLabel) memberLabel.textContent = isGroup ? "加入團課學員" : "會員";
      if (memberSelect) memberSelect.placeholder = isGroup ? "輸入姓名加入團課學員" : "輸入姓名搜尋會員";
      renderGroupBookingMembers();
      updatePreview();
    }

    function updateMetrics() {
      const todayNumber = currentCalendarDayNumber();
      const todayWeekOffset = Math.floor((todayNumber - 18) / 7);
      const todayKey = days.find(day => getDayNumber(day.key, todayWeekOffset) === todayNumber)?.key || "fri";
      const todayBookings = bookings.filter(item =>
        item.status !== "cancelled" &&
        item.day === todayKey &&
        (item.weekOffset || 0) === todayWeekOffset
      );
      const fullSlots = times.filter(time => capacityFor(todayKey, time, todayWeekOffset).general >= 3).length;
      document.querySelector("#todayGeneral").textContent = todayBookings.reduce((sum, item) => sum + item.general, 0);
      document.querySelector("#todayGroups").textContent = todayBookings.reduce((sum, item) => sum + item.groupSlot, 0);
      document.querySelector("#todayFull").textContent = fullSlots;
    }

    async function refreshCalendarContent() {
      if (!refreshCalendarBtn) return;
      refreshCalendarBtn.classList.add("refreshing");
      refreshCalendarBtn.disabled = true;
      try {
        await loadAppData();
        renderCalendarCourseFilters();
        renderCalendar();
        renderActivityLog();
        renderOperationsSummary();
        updateMetrics();
        updatePreview();
        showToast("行事曆內容已更新", "success", "更新完成");
      } catch (error) {
        console.warn("Calendar refresh failed", error);
        showToast("更新行事曆時發生問題，請稍後再試。", "error", "更新失敗");
      } finally {
        refreshCalendarBtn.classList.remove("refreshing");
        refreshCalendarBtn.disabled = false;
      }
    }

    bookingForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (bookingFormStep === "basic") {
        goBookingDetailStep();
        return;
      }
      syncTicketCount();
      const validation = validateSeries();
      if (!validation.ok) {
        showToast(validation.message, "error", "不可預約");
        updatePreview();
        return;
      }

      const createdBookings = [];
      const occurrences = getSeriesOccurrences();
      if (!(await confirmChange(occurrences.length > 1
        ? `確認要建立 ${occurrences.length} 筆預約嗎？`
        : "確認要新增這筆預約嗎？"))) {
        return;
      }
      const seriesId = repeatBooking.checked ? Date.now() : null;
      for (const occurrence of occurrences) {
        const booking = buildBooking(occurrence, seriesId);
        if (!booking) continue;
        bookings.push(booking);
        createdBookings.push(booking);
      }

      const plan = getPlanInfo(bookingType.value);
      const member = getSelectedMember();
      if (plan.kind === "group") {
        selectedGroupMembers().forEach(groupMember => consumeMemberTicket(groupMember, "group", createdBookings.length));
        groupBookingMemberIds = [];
        renderGroupBookingMembers();
        renderMemberSelect();
        renderBookingTypeOptions();
        renderProfileSelect();
        renderMemberProfile();
      } else if (plan.kind !== "trial" && member) {
        const walletKey = bookingTicketWalletKey(plan);
        if (plan.kind === "self") {
          createdBookings.forEach(booking => consumeSelfTrainingTicket(member, 1, booking.day, booking.time));
        } else {
          consumeMemberTicket(member, walletKey, createdBookings.length);
        }
        const remaining = plan.kind === "self"
          ? availableSelfTrainingTickets(member, bookingDay.value, bookingTime.value)
          : member.ticketWallet[walletKey];
        if (remaining === 0) member.status = "待補票";
        else if (remaining === 1) member.status = "續約";
        else member.status = remaining <= 2 ? "低堂數" : "正常";
        renderMemberSelect();
        renderBookingTypeOptions();
        renderProfileSelect();
        renderMemberProfile();
      }

      saveAppData();
      renderCalendar();
      renderSeriesList(createdBookings);
      updatePreview();
      appRoot.classList.remove("booking-panel-open");
      setBookingFormStep("basic", { skipPreview: true });
      addActivity("新增", createdBookings.length > 1
        ? `${bookingMemberNames(createdBookings[0])} 建立 ${createdBookings.length} 堂固定預約`
        : `${bookingMemberNames(createdBookings[0])} ${createdBookings[0]?.title || "預約"}`);
      formMessage.className = "message";
      formMessage.textContent = createdBookings.length > 1
        ? `已建立 ${createdBookings.length} 堂固定預約。第 1 週已顯示在目前週曆，其餘週次已保留在預約資料中。`
        : "預約已建立，行事曆和容量已更新。";
    });

    bookingType.addEventListener("change", async () => {
      const selectedMember = getSelectedMember();
      if (selectedMember && !memberCanBookType(selectedMember)) {
        bookingMemberId = "";
        memberSelect.value = "";
      }
      memberSuggestions.classList.add("hidden");
      renderTimePartOptions(bookingTime.value);
      renderSecondBookingTimeOptions(secondBookingTime.value);
      if (getPlanInfo(bookingType.value).kind !== "group") {
        groupBookingMemberIds = [];
      } else if (bookingMemberId) {
        groupBookingMemberIds = [bookingMemberId];
        bookingMemberId = "";
        memberSelect.value = "";
      }
      renderGroupBookingMembers();
      updatePeopleByType();
    });
    coachName.addEventListener("change", updatePreview);
    bookingNextStep?.addEventListener("click", goBookingDetailStep);
    bookingBackStep?.addEventListener("click", () => setBookingFormStep("basic"));
    memberSelect.addEventListener("input", () => {
      renderMemberSuggestionList(memberSelect, memberSuggestions, selectBookingMember, member =>
        memberCanBookType(member) && (!isGroupBookingSelected() || !groupBookingMemberIds.includes(member.id))
      );
      syncBookingMemberFromInput();
    });
    memberSelect.addEventListener("focus", () => memberSuggestions.classList.add("hidden"));
    memberSelect.addEventListener("change", syncBookingMemberFromInput);
    memberProfileSelect.addEventListener("input", () => {
      profileMemberId = "";
      memberCurrentPage = 1;
      memberProfileSuggestions.classList.add("hidden");
      renderMemberProfile();
    });
    memberProfileSelect.addEventListener("focus", () => memberProfileSuggestions.classList.add("hidden"));
    memberProfileSelect.addEventListener("change", async () => {
      profileMemberId = "";
      memberCurrentPage = 1;
      renderMemberProfile();
    });
    memberDirectorySearch?.addEventListener("input", () => {
      memberDirectoryKeyword = memberDirectorySearch.value;
      memberCurrentPage = 1;
      renderMemberDirectory();
    });
    [memberLevelFilter, memberTicketFilter, memberStatusFilter].forEach(filter => {
      filter?.addEventListener("change", () => {
        memberLevelFilterValue = memberLevelFilter?.value || "all";
        memberTicketFilterValue = memberTicketFilter?.value || "all";
        memberStatusFilterValue = memberStatusFilter?.value || "all";
        memberCurrentPage = 1;
        renderMemberDirectory();
      });
    });
    clearMemberFilters?.addEventListener("click", () => {
      memberDirectoryKeyword = "";
      memberLevelFilterValue = "all";
      memberTicketFilterValue = "all";
      memberStatusFilterValue = "all";
      if (memberDirectorySearch) memberDirectorySearch.value = "";
      if (memberLevelFilter) memberLevelFilter.value = "all";
      if (memberTicketFilter) memberTicketFilter.value = "all";
      if (memberStatusFilter) memberStatusFilter.value = "all";
      memberCurrentPage = 1;
      renderMemberDirectory();
    });
    memberTestGrid?.addEventListener("click", async event => {
      const card = event.target.closest("[data-open-member-id]");
      if (!card || !memberTestGrid.contains(card)) return;
      openMemberCardById(card.dataset.openMemberId);
    });
    detailMemberSelect.addEventListener("input", () => renderMemberSuggestionList(detailMemberSelect, detailMemberSuggestions, selectDetailMember));
    detailMemberSelect.addEventListener("focus", () => renderMemberSuggestionList(detailMemberSelect, detailMemberSuggestions, selectDetailMember));
    bookingDay.addEventListener("change", async () => {
      renderTimePartOptions(bookingTime.value);
      renderBookingTypeOptions();
      updatePreview();
    });
    bookingHour.addEventListener("change", async () => {
      renderTimePartOptions(`${bookingHour.value}:${bookingMinute.value}`);
      renderBookingTypeOptions();
      updatePreview();
    });
    bookingMinute.addEventListener("change", () => {
      syncBookingTimeFromParts();
      renderBookingTypeOptions();
      updatePreview();
    });
    peopleCount.addEventListener("change", updatePreview);
    repeatBooking.addEventListener("change", updatePreview);
    weeklyFrequency.addEventListener("change", updatePreview);
    ticketCount.addEventListener("change", updatePreview);
    secondBookingDay.addEventListener("change", async () => {
      renderSecondBookingTimeOptions(secondBookingTime.value);
      updatePreview();
    });
    secondBookingTime.addEventListener("change", updatePreview);
    detailRepeatBooking.addEventListener("change", updateDetailRepeatPreview);
    detailWeeklyFrequency.addEventListener("change", updateDetailRepeatPreview);
    detailRepeatCount.addEventListener("change", updateDetailRepeatPreview);
    detailSecondBookingDay.addEventListener("change", async () => {
      const booking = bookings.find(item => item.id === activeBookingId);
      if (booking) renderDetailSecondTimeOptions(booking, detailSecondBookingTime.value);
      updateDetailRepeatPreview();
    });
    detailSecondBookingTime.addEventListener("change", updateDetailRepeatPreview);
    createDetailRepeatBtn.addEventListener("click", createRepeatFromActiveBooking);
    clearSeries.addEventListener("click", async () => {
      seriesList.innerHTML = "";
      formMessage.className = "message";
      formMessage.textContent = "已清除重複預約示範紀錄。";
    });
    document.addEventListener("click", async event => {
      if (!memberSelect.closest(".search-field").contains(event.target)) memberSuggestions.classList.add("hidden");
      if (!memberProfileSelect.closest(".search-field").contains(event.target)) memberProfileSuggestions.classList.add("hidden");
      if (!detailMemberSelect.closest(".search-field").contains(event.target)) detailMemberSuggestions.classList.add("hidden");
      if (groupMemberSearch && !groupMemberSearch.closest(".search-field").contains(event.target)) groupMemberSuggestions.classList.add("hidden");
    });
    toggleAddMember.addEventListener("click", async () => {
      addMemberBox.classList.toggle("active");
    });
    closeAddMemberBox?.addEventListener("click", async () => {
      addMemberBox.classList.remove("active");
    });
    openMemberRechargeTop?.addEventListener("click", async () => {
      openRechargeMemberPickerDialog();
    });
    toggleAddCourseForm?.addEventListener("click", async () => {
      setCourseManagementBranch("courses");
      openNewCourseItemEditor("newCourse");
    });
    toggleAddTicketForm?.addEventListener("click", async () => {
      setCourseManagementBranch("tickets");
      openNewCourseItemEditor("newTicket");
    });
    createMemberBtn.addEventListener("click", async () => {
      const name = newMemberName.value.trim();
      const phone = normalizePhoneNumber(newMemberPhone.value);
      if (!name) {
        formMessage.className = "message error";
        formMessage.textContent = "請先輸入會員姓名。";
        return;
      }
      if (!phone) {
        formMessage.className = "message error";
        formMessage.textContent = "請先輸入會員電話。";
        return;
      }
      const duplicatedPhoneMember = members.find(member => normalizePhoneNumber(member.phone) === phone);
      if (duplicatedPhoneMember) {
        formMessage.className = "message error";
        formMessage.textContent = `電話 ${phone} 已經存在於 ${duplicatedPhoneMember.name}，請確認是否為同一位會員。`;
        return;
      }
      if (!(await confirmChange(`確認要新增會員 ${name} 嗎？`))) return;
      const member = {
        id: `m${String(Date.now()).slice(-6)}`,
        name,
        phone,
        gender: newMemberGender.value,
        birthday: newMemberBirthday.value ? newMemberBirthday.value.replaceAll("-", "/") : "",
        lineId: newMemberLineId.value.trim(),
        identity: "新朋友",
        plan: "體驗 / 待開票",
        tickets: 0,
        expiresAt: "未設定",
        registeredAt: todayDateSlash(),
        status: "待處理",
        ticketWallet: { course: 0, selfTraining: 0, group: 0, massage: 0 },
        ticketExpiry: { selfTraining: "", group: "" },
        rechargeHistory: [],
        ticketBuckets: []
      };
      members.push(member);
      normalizeMember(member);
      profileMemberId = "";
      bookingMemberId = "";
      memberProfileSelect.value = "";
      memberCurrentPage = 1;
      addMemberBox.classList.remove("active");
      dataReadyToSave = true;
      saveAppData();
      renderMemberSelect();
      renderBookingTypeOptions();
      renderProfileSelect();
      renderMemberProfile();
      updatePreview();
      newMemberName.value = "";
      newMemberPhone.value = "";
      newMemberGender.value = "";
      newMemberBirthday.value = "";
      newMemberLineId.value = "";
      formMessage.className = "message";
      formMessage.textContent = `已新增會員 ${member.name}。`;
    });
    document.querySelectorAll("[data-view-target]").forEach(button => {
      button.addEventListener("click", async () => {
        const courseSubgroup = document.querySelector(".nav-subgroup");
        if (button.dataset.courseNavRoot === "true") {
          courseSubgroup?.classList.toggle("collapsed");
        } else if (button.dataset.courseNavBranch) {
          courseSubgroup?.classList.remove("collapsed");
        }
        document.querySelectorAll(".nav button").forEach(navButton => navButton.classList.remove("active"));
        if (!button.dataset.courseNavBranch) button.classList.add("active");
        document.querySelectorAll(".view-section").forEach(section => section.classList.add("hidden"));
        document.querySelectorAll(".calendar-panel").forEach(section => section.classList.add("hidden"));
        const target = document.querySelector(`#${button.dataset.viewTarget}`);
        if (target) target.classList.remove("hidden");
        if (button.dataset.courseNavBranch) setCourseManagementBranch(button.dataset.courseNavBranch);
        const isCalendar = button.dataset.viewTarget === "calendarView";
        document.querySelectorAll(".calendar-panel").forEach(section => section.classList.toggle("hidden", !isCalendar));
        appRoot.classList.toggle("member-mode", !isCalendar);
        if (!isCalendar) appRoot.classList.remove("booking-panel-open");
        if (button.dataset.viewTarget === "membersView") renderMemberProfile();
        if (button.dataset.viewTarget === "staffView") renderStaffManagement();
        if (button.dataset.viewTarget === "coursesView") renderCourseManagement();
        if (button.dataset.viewTarget === "operationsView") renderOperationsSummary();
        target?.scrollIntoView({ block: "start" });
      });
    });
    calendarTypeFilters.querySelectorAll("input").forEach(input => {
      input.addEventListener("change", renderCalendar);
    });
    todayCalendarBtn.addEventListener("click", async () => {
      resetCalendarToToday();
      renderCalendar();
      updatePreview();
    });
    prevWeekBtn.addEventListener("click", async () => {
      calendarStartOffset -= calendarNavigationStep();
      calendarWeekOffset = Math.floor(calendarStartOffset / 7);
      renderCalendar();
      updatePreview();
    });
    nextWeekBtn.addEventListener("click", async () => {
      calendarStartOffset += calendarNavigationStep();
      calendarWeekOffset = Math.floor(calendarStartOffset / 7);
      renderCalendar();
      updatePreview();
    });
    refreshCalendarBtn?.addEventListener("click", refreshCalendarContent);
    calendarViewButtons.forEach(button => {
      button.addEventListener("click", async () => {
        if (isMobileCalendarLayout() && button.dataset.calendarView === "week") return;
        const currentWeekStart = Math.floor(calendarStartOffset / 7) * 7;
        calendarViewMode = button.dataset.calendarView;
        calendarStartOffset = calendarViewMode === "week" ? currentWeekStart : currentWeekStart + currentBaseDayIndex();
        calendarWeekOffset = Math.floor(calendarStartOffset / 7);
        renderCalendar();
      });
    });
    calendarTypeFilters?.addEventListener("change", event => {
      if (event.target?.matches("input[type='checkbox']")) renderCalendar();
    });
    calendarCoachFilter?.addEventListener("click", event => {
      const button = event.target?.closest("[data-coach-filter]");
      if (!button) return;
      calendarCoachFilter.dataset.selected = button.dataset.coachFilter || "all";
      calendarCoachFilter.querySelectorAll("[data-coach-filter]").forEach(item => {
        item.classList.toggle("active", item === button);
      });
      renderCalendar();
    });
    window.addEventListener("resize", () => {
      const beforeMode = calendarViewMode;
      enforceResponsiveCalendarMode();
      if (beforeMode !== calendarViewMode) renderCalendar();
      updateStickyCalendarOffset();
    });
    memberSortMode.addEventListener("change", renderMemberProfile);
    memberSortButtons.querySelectorAll("[data-member-sort]").forEach(button => {
      button.addEventListener("click", async () => {
        memberSortMode.value = button.dataset.memberSort;
        memberCurrentPage = 1;
        renderMemberProfile();
      });
    });
    addCourseItem.addEventListener("click", async () => {
      const name = newCourseName.value.trim();
      if (!name) return;
      if (!(await confirmChange(`確認要新增課程 ${name} 嗎？`))) return;
      courseItems.push(normalizeCourseItem({ id: `c${Date.now()}`, name, kind: newCourseKind.value }));
      newCourseName.value = "";
      saveAppData();
      renderCourseManagement();
    });
    addTicketItem.addEventListener("click", async () => {
      const name = newTicketName.value.trim();
      const count = Math.max(1, Number(newTicketCount.value) || 1);
      if (!name) return;
      if (!(await confirmChange(`確認要新增票券 ${name} 嗎？`))) return;
      ticketItems.push({ id: `t${Date.now()}`, name, type: newTicketKind.value, count });
      newTicketName.value = "";
      newTicketCount.value = "1";
      saveAppData();
      renderCourseManagement();
    });
    staffRoleFilter.addEventListener("change", renderStaffManagement);
    staffSelect.addEventListener("change", async () => {
      staffMemberId = staffSelect.value;
      renderStaffManagement();
    });
    toggleAddStaff.addEventListener("click", async () => {
      staffAddBox.classList.toggle("active");
    });
    createStaffBtn.addEventListener("click", async () => {
      const name = newStaffName.value.trim();
      if (!name) return;
      if (!(await confirmChange(`確認要新增教練/員工 ${name} 嗎？`))) return;
      const role = newStaffRole.value;
      const displayName = name.replace(/^Coach\s+/i, "");
      staffMembers.push({
        id: `s${Date.now()}`,
        name: displayName,
        displayName,
        role,
        level: role === "正職教練" ? "LV1" : "",
        phone: newStaffPhone.value.trim() || "未填",
        status: "在職",
        startDate: todayDateSlash(),
        payNote: role === "正職教練" ? "月薪制，另計堂數獎金" : "依實際上課堂數計算",
        classTypes: role.includes("教練") ? ["教練課", "團體課"] : ["櫃台流程"],
        schedule: ["待設定"],
        clockRequired: role === "正職教練" || role.includes("櫃台"),
        clockRecords: [],
        alerts: [],
        dutyHours: Number(newStaffDutyHours.value) || 0,
        basePay: role === "正職教練" ? 36000 : 0,
        classBonus: role === "正職教練" ? 200 : role === "兼職教練" ? 700 : 900
      });
      normalizeStaff(staffMembers[staffMembers.length - 1]);
      staffMemberId = staffMembers[staffMembers.length - 1].id;
      newStaffName.value = "";
      newStaffPhone.value = "";
      newStaffDutyHours.value = "0";
      staffAddBox.classList.remove("active");
      renderCoachOptions();
      renderCalendarCoachFilter();
      saveAppData();
      renderStaffManagement();
      renderOperationsSummary();
    });
    deleteStaffBtn?.addEventListener("click", async () => {
      const index = staffMembers.findIndex(staff => staff.id === staffMemberId);
      if (index < 0) return;
      if (!(await confirmChange(`確認要刪除 ${staffMembers[index].displayName || staffMembers[index].name} 嗎？`))) return;
      staffMembers.splice(index, 1);
      staffMemberId = staffMembers[0]?.id || "";
      renderCoachOptions();
      renderCalendarCoachFilter();
      saveAppData();
      renderStaffManagement();
      renderOperationsSummary();
    });
    closeBookingPanel.addEventListener("click", async () => {
      appRoot.classList.remove("booking-panel-open");
      setBookingFormStep("basic", { skipPreview: true });
    });
    closeBookingModal.addEventListener("click", closeBookingDetail);
    openDetailRepeatModalBtn?.addEventListener("click", openDetailRepeatDialog);
    closeDetailRepeatModal?.addEventListener("click", closeDetailRepeatDialog);
    detailRepeatModal?.addEventListener("click", event => {
      if (event.target === detailRepeatModal) closeDetailRepeatDialog();
    });
    closeGroupMemberModal?.addEventListener("click", closeGroupMemberDialog);
    cancelGroupMemberModal?.addEventListener("click", closeGroupMemberDialog);
    groupMemberModal?.addEventListener("click", event => {
      if (event.target === groupMemberModal) closeGroupMemberDialog();
    });
    groupMemberSearch?.addEventListener("input", () => {
      pendingGroupDetailMemberId = "";
      renderMemberSuggestionList(groupMemberSearch, groupMemberSuggestions, selectGroupDetailMember, groupJoinPredicate);
    });
    groupMemberSearch?.addEventListener("focus", () => groupMemberSuggestions.classList.add("hidden"));
    confirmGroupMemberBtn?.addEventListener("click", addMemberToActiveGroup);
    saveBookingNoteBtn.addEventListener("click", saveActiveBookingNote);
    cancelBookingBtn.addEventListener("click", cancelActiveBooking);
    bookingCheckInBtn.addEventListener("click", async () => checkInBooking(activeBookingId));
    addGroupMemberBtn.addEventListener("click", addMemberToActiveGroup);
    bookingModal.addEventListener("click", async event => {
      if (event.target === bookingModal) closeBookingDetail();
    });
    openActivityLog.addEventListener("click", openActivityDialog);
    closeActivityLog.addEventListener("click", closeActivityDialog);
    activityLogModal.addEventListener("click", async event => {
      if (event.target === activityLogModal) closeActivityDialog();
    });
    closeMemberDetail.addEventListener("click", closeMemberDetailModal);
    memberDetailModal.addEventListener("click", async event => {
      if (event.target === memberDetailModal) closeMemberDetailModal();
    });
    closeStaffDetailModal?.addEventListener("click", closeStaffDetailDialog);
    staffDetailModal?.addEventListener("click", async event => {
      if (event.target === staffDetailModal) closeStaffDetailDialog();
    });
    closeRechargeModal.addEventListener("click", closeRechargeModalDialog);
    rechargeModal.addEventListener("click", async event => {
      if (event.target === rechargeModal) closeRechargeModalDialog();
    });
    closeCourseItemModal.addEventListener("click", closeCourseItemEditor);
    cancelCourseItemModal.addEventListener("click", closeCourseItemEditor);
    saveCourseItemModal.addEventListener("click", saveCourseItemEditor);
    deleteCourseItemModal.addEventListener("click", deleteCourseItemEditor);
    courseItemModal.addEventListener("click", event => {
      if (event.target === courseItemModal) closeCourseItemEditor();
    });
    cancelConfirmBtn.addEventListener("click", () => closeConfirmModal(false));
    acceptConfirmBtn.addEventListener("click", () => closeConfirmModal(true));
    confirmModal.addEventListener("click", event => {
      if (event.target === confirmModal) closeConfirmModal(false);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeFloatingSurfaces();
    });
    window.addEventListener("beforeunload", saveAppData);
    window.addEventListener("pagehide", saveAppData);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveAppData();
    });

    async function startApp() {
      await loadAppData();
      const courseCatalogUpdated = ensureRequestedCourseCatalog();
      const friendlySelfTicketAdded = ensureFriendlySelfTicketItem();
      const staffRosterUpdated = ensureRequestedStaffRoster();
      const testBookingsAdded = ensureMay25TestBookings();
      const may28TestFixed = ensureSplitMay28FriendlyTestBooking();
      const coachNamesUpdated = remapBookingCoachNames();
      const memberLevelsUpdated = members.reduce((changed, member) => updateMemberLevelFromCompletedCourses(member) || changed, false);
      dataReadyToSave = true;
      if (courseCatalogUpdated || friendlySelfTicketAdded || staffRosterUpdated || testBookingsAdded || may28TestFixed || coachNamesUpdated || memberLevelsUpdated || bookingNormalizationChanged) saveAppData();
      bookingNormalizationChanged = false;
      initOptions();
      resetCalendarToToday();
      enforceResponsiveCalendarMode();
      updatePeopleByType();
      renderCalendar();
      renderOperationsSummary();
      renderCourseManagement();
      setInterval(updateClockDisplay, 1000);
    }

    startApp();
