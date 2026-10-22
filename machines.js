/**
 * 機台資料 (商城首頁與遊戲頁共用)
 *
 * 目前是「範例商品」，請換成你自己的商品。之後接上 Supabase 時，這份資料會改由資料庫提供，
 * 欄位維持不變：
 *   id         機台代號 (網址 play.html?m=<id>)
 *   name       機台名稱
 *   category   食物｜飲料｜泡麵｜生活用品｜美妝保養｜寵物用品｜玩具｜其他
 *   type       'paid' 付費機台 (每次 pricePerPlay 元) ／ 'free' 免費機台 (每日 freePlays 次)
 *   pricePerPlay  付費機台每次費用 (NT$)
 *   freePlays     免費機台每日免費次數
 *   guarantee  保證取物金額 (NT$)：累計投入達此金額，下一次必中
 *   plays      累計遊玩次數 (目前為 0，接資料庫後才會有全站統計)
 *   featured   人氣精選
 *   addedAt    上架日期 (用於「最新上架」排序)
 *   product    { name, desc, price(市價), spec }
 *   art        { icon, color, label }  商品圖示 (沒有商品照片時用)，label 最多 5 字
 *   image      (選填) 商品照片網址，有填就優先顯示
 */
window.MALL_CATEGORIES = ['食物', '飲料', '泡麵', '生活用品', '美妝保養', '寵物用品', '玩具', '3C數位', '其他'];

window.MACHINES = [
  { id: 'snack-chips', name: '海苔洋芋片大包', category: '食物', type: 'free', freePlays: 3, guarantee: 0, featured: true, addedAt: '2026-10-18',
    product: { name: '範例｜海苔洋芋片大包', desc: '厚切海苔口味，分享包裝。', price: 79, spec: '1 包' }, art: { icon: '🥔', color: '#349361', label: '洋芋片' } },
  { id: 'drink-milktea', name: '奶茶 6 入', category: '飲料', type: 'paid', pricePerPlay: 10, guarantee: 300, featured: true, addedAt: '2026-10-17',
    product: { name: '範例｜經典奶茶 6 入', desc: '鋁箔包奶茶，整組帶走。', price: 120, spec: '6 入' }, art: { icon: '🧋', color: '#c47f3a', label: '奶茶' } },
  { id: 'drink-greentea', name: '綠茶 6 入', category: '飲料', type: 'paid', pricePerPlay: 10, guarantee: 300, addedAt: '2026-10-16',
    product: { name: '範例｜無糖綠茶 6 入', desc: '清爽無糖。', price: 110, spec: '6 入' }, art: { icon: '🍵', color: '#4f9d4f', label: '綠茶' } },
  { id: 'noodle-beef', name: '紅燒牛肉麵', category: '泡麵', type: 'paid', pricePerPlay: 10, guarantee: 200, featured: true, addedAt: '2026-10-16',
    product: { name: '範例｜紅燒牛肉麵 5 入', desc: '台式經典泡麵。', price: 99, spec: '5 入' }, art: { icon: '🍜', color: '#cf473d', label: '牛肉麵' } },
  { id: 'noodle-free', name: '每日泡麵挑戰', category: '泡麵', type: 'free', freePlays: 5, guarantee: 0, addedAt: '2026-10-15',
    product: { name: '範例｜迷你泡麵 1 碗', desc: '每日免費挑戰，夾中留下收藏紀錄。', price: 35, spec: '1 碗' }, art: { icon: '🍜', color: '#e8903a', label: '泡麵' } },
  { id: 'life-tissue', name: '抽取式衛生紙', category: '生活用品', type: 'free', freePlays: 10, guarantee: 0, featured: true, addedAt: '2026-10-15',
    product: { name: '範例｜抽取式衛生紙 10 包', desc: '居家必備。', price: 89, spec: '10 包' }, art: { icon: '🧻', color: '#6fa8ff', label: '衛生紙' } },
  { id: 'life-detergent', name: '洗衣精補充包', category: '生活用品', type: 'paid', pricePerPlay: 10, guarantee: 400, addedAt: '2026-10-14',
    product: { name: '範例｜洗衣精補充包 1.8L', desc: '清香配方。', price: 149, spec: '1 包' }, art: { icon: '🧴', color: '#4aa8ff', label: '洗衣精' } },
  { id: 'beauty-shampoo', name: '洗髮露 300ml', category: '美妝保養', type: 'paid', pricePerPlay: 10, guarantee: 500, featured: true, addedAt: '2026-10-14',
    product: { name: '範例｜溫和洗髮露 300ml', desc: '溫和潔淨。', price: 280, spec: '300ml' }, art: { icon: '🧴', color: '#3f8f6a', label: '洗髮露' } },
  { id: 'beauty-mask', name: '保濕面膜 5 片', category: '美妝保養', type: 'paid', pricePerPlay: 10, guarantee: 300, addedAt: '2026-10-13',
    product: { name: '範例｜保濕面膜 5 片', desc: '日常保濕。', price: 150, spec: '5 片' }, art: { icon: '🧖', color: '#e58fb0', label: '面膜' } },
  { id: 'pet-cat', name: '貓罐頭 24 入', category: '寵物用品', type: 'paid', pricePerPlay: 10, guarantee: 600, addedAt: '2026-10-13',
    product: { name: '範例｜貓罐頭 24 入', desc: '主食罐，口味隨機。', price: 480, spec: '24 入' }, art: { icon: '🐱', color: '#e49a58', label: '貓罐頭' } },
  { id: 'pet-treat', name: '狗狗零食包', category: '寵物用品', type: 'free', freePlays: 3, guarantee: 0, addedAt: '2026-10-12',
    product: { name: '範例｜狗狗潔牙骨 1 包', desc: '每日免費挑戰。', price: 85, spec: '1 包' }, art: { icon: '🦴', color: '#b88b5a', label: '潔牙骨' } },
  { id: 'toy-plush', name: '療癒小熊娃娃', category: '玩具', type: 'paid', pricePerPlay: 10, guarantee: 300, featured: true, addedAt: '2026-10-12',
    product: { name: '範例｜療癒小熊娃娃', desc: '25cm 絨毛玩偶。', price: 199, spec: '1 隻' }, art: { icon: '🧸', color: '#b98150', label: '小熊' } },
  { id: 'toy-bricks', name: '積木城堡', category: '玩具', type: 'paid', pricePerPlay: 10, guarantee: 800, addedAt: '2026-10-11',
    product: { name: '範例｜積木城堡大盒', desc: '約 600 顆粒。', price: 650, spec: '1 盒' }, art: { icon: '🏰', color: '#ba75ab', label: '積木' } },
  { id: 'food-fruit', name: '當季水果箱', category: '食物', type: 'paid', pricePerPlay: 10, guarantee: 700, addedAt: '2026-10-11',
    product: { name: '範例｜當季水果箱', desc: '依產季出貨。', price: 599, spec: '1 箱' }, art: { icon: '🍎', color: '#d94f4f', label: '水果' } },
  { id: 'food-cookies', name: '巧克力夾心餅', category: '食物', type: 'free', freePlays: 3, guarantee: 0, addedAt: '2026-10-10',
    product: { name: '範例｜巧克力夾心餅分享包', desc: '下午茶好夥伴。', price: 69, spec: '1 包' }, art: { icon: '🍪', color: '#906047', label: '夾心餅' } },
  { id: 'other-gift', name: '神秘福袋', category: '其他', type: 'paid', pricePerPlay: 10, guarantee: 500, addedAt: '2026-10-10',
    product: { name: '範例｜神秘福袋', desc: '內容物依店家搭配。', price: 399, spec: '1 袋' }, art: { icon: '🎁', color: '#9b6bd8', label: '福袋' } }
  ,{id:'tech-earbuds',name:'無線耳機專屬台',category:'3C數位',type:'paid',pricePerPlay:20,guarantee:600,featured:true,addedAt:'2026-10-22',product:{name:'範例｜真無線藍牙耳機',desc:'輕巧充電盒與無線耳機組，展示商品。',price:599,spec:'1 組'},art:{color:'#526c65',label:'無線耳機',icon:'🎧'}},
  {id:'tech-speaker',name:'隨身音樂小劇場',category:'3C數位',type:'paid',pricePerPlay:20,guarantee:800,addedAt:'2026-10-22',product:{name:'範例｜便攜藍牙喇叭',desc:'掌心大小的便攜喇叭，展示商品。',price:799,spec:'1 台'},art:{color:'#bb9762',label:'藍牙喇叭',icon:'🔊'}},
  {id:'figure-star',name:'星願公仔收藏台',category:'玩具',type:'paid',pricePerPlay:10,guarantee:500,featured:true,mode:'figure',addedAt:'2026-10-22',product:{name:'範例｜星願精靈公仔',desc:'盒裝收藏公仔，原創角色展示款。',price:399,spec:'1 盒'},art:{color:'#9883a5',label:'星願公仔',icon:'✦'}}
].map(m => ({ plays: 0, pricePerPlay: 10, freePlays: 0, mode: m.category==='3C數位'?'tech':m.id==='toy-plush'?'plush':'avalanche', ...m }));
