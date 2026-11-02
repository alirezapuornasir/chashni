import { categories, seedRecipes } from './data.js';

const STORE = {
  recipes: 'chashni_user_recipes_v1', favorites: 'chashni_favorites_v1', pantry: 'chashni_pantry_v1',
  equipment: 'chashni_equipment_v1', shopping: 'chashni_shopping_v1', planner: 'chashni_planner_v1'
};
const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const CATEGORY_LABELS = Object.fromEntries(categories.map(c => [c.id, c.label]));
const CATEGORY_EMOJI = Object.fromEntries(categories.map(c => [c.id, c.emoji]));
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const readStore = (key, fallback) => {
  try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; }
  catch { return fallback; }
};
const writeStore = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const fa = value => Number(value).toLocaleString('fa-IR');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const normalize = value => String(value ?? '').toLocaleLowerCase('fa-IR').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064B-\u065F]/g, '').replace(/[\u200c\s\-_.،,؛;:!؟?()[\]{}]/g, '');

let userRecipes = readStore(STORE.recipes, []);
let favorites = new Set(readStore(STORE.favorites, []));
let pantry = readStore(STORE.pantry, []);
let equipment = new Set(readStore(STORE.equipment, []));
let shoppingList = readStore(STORE.shopping, []);
let planner = readStore(STORE.planner, {});
let onlineRecipes = [];
let activeCategory = 'all';
let query = '';
let favoritesOnly = false;
let sortMode = 'recommended';
let visibleLimit = 12;
let currentRecipe = null;
let currentServings = 1;

const getAllRecipes = () => [...seedRecipes, ...userRecipes, ...onlineRecipes];
const findRecipe = id => getAllRecipes().find(recipe => recipe.id === id);

function toast(message, type = 'success') {
  const node = document.createElement('div');
  node.className = `toast${type === 'error' ? ' error' : ''}`;
  node.textContent = message;
  $('#toastRegion').append(node);
  setTimeout(() => node.remove(), 3200);
}

function categoryName(id) { return CATEGORY_LABELS[id] || 'دستور شخصی'; }

function imageMarkup(recipe, extraClass = '') {
  const image = recipe.image || 'assets/food-placeholder.svg';
  return `<img class="${extraClass}" src="${escapeHTML(image)}" alt="${escapeHTML(recipe.title)}" loading="lazy" onerror="this.onerror=null;this.src='assets/food-placeholder.svg'">`;
}

function cardMarkup(recipe) {
  const isFavorite = favorites.has(recipe.id);
  const badge = recipe.trend ? '<span class="recipe-badge hot">✦ محبوب</span>' : `<span class="recipe-badge">${escapeHTML(categoryName(recipe.category))}</span>`;
  const ownActions = recipe.userCreated ? `<button class="edit-recipe-btn" data-edit="${escapeHTML(recipe.id)}" title="ویرایش دستور">✎</button>` : '';
  return `<article class="recipe-card" data-open="${escapeHTML(recipe.id)}">
    <div class="recipe-image">${imageMarkup(recipe)}${badge}<button class="favorite-btn${isFavorite ? ' active' : ''}" data-favorite="${escapeHTML(recipe.id)}" aria-label="${isFavorite ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}">${isFavorite ? '♥' : '♡'}</button></div>
    <div class="recipe-card-body"><div class="recipe-kicker"><span>${escapeHTML(recipe.cuisine || categoryName(recipe.category))}</span><span>${escapeHTML(recipe.difficulty || 'آسان')}</span></div>
      <h3 class="recipe-title">${escapeHTML(recipe.title)}</h3><p class="recipe-subtitle">${escapeHTML(recipe.subtitle || recipe.tags?.slice(0, 2).join('، ') || 'یک پیشنهاد خوشمزه از چاشنی')}</p>
      <div class="recipe-meta"><span>◷ <strong>${fa(recipe.time || 30)}</strong> دقیقه</span><span>♧ <strong>${fa(recipe.servings || 2)}</strong> نفر</span><span>✦ <strong>${fa(recipe.calories || 0)}</strong> کالری</span></div>${ownActions}
    </div></article>`;
}

function renderCategoryControls() {
  $('#categoryPills').innerHTML = categories.map(c => `<button class="category-pill${activeCategory === c.id ? ' active' : ''}" data-category="${c.id}">${c.emoji} ${c.label}</button>`).join('');
  $('#filterRow').innerHTML = categories.map(c => `<button class="filter-chip${activeCategory === c.id ? ' active' : ''}" data-category="${c.id}">${c.emoji} ${c.label}</button>`).join('');
}

function renderTrends() {
  const trendRecipes = getAllRecipes().filter(r => r.trend).slice(0, 8);
  $('#trendGrid').innerHTML = trendRecipes.map(cardMarkup).join('');
}

function filteredRecipes() {
  const q = normalize(query);
  let items = getAllRecipes().filter(recipe => {
    const categoryMatch = activeCategory === 'all' || recipe.category === activeCategory;
    const searchable = normalize([recipe.title, recipe.subtitle, recipe.cuisine, recipe.origin, ...(recipe.tags || []), ...(recipe.ingredients || [])].join(' '));
    const queryMatch = !q || searchable.includes(q);
    const favoriteMatch = !favoritesOnly || favorites.has(recipe.id);
    return categoryMatch && queryMatch && favoriteMatch;
  });
  if (sortMode === 'quick') items.sort((a, b) => (a.time || 999) - (b.time || 999));
  else if (sortMode === 'easy') items.sort((a, b) => (a.difficulty === 'آسان' ? 0 : 1) - (b.difficulty === 'آسان' ? 0 : 1) || (a.time || 999) - (b.time || 999));
  else if (sortMode === 'popular') items.sort((a, b) => Number(Boolean(b.trend)) - Number(Boolean(a.trend)) || (a.time || 999) - (b.time || 999));
  else items.sort((a, b) => Number(Boolean(b.trend)) - Number(Boolean(a.trend)) || (a.time || 999) - (b.time || 999));
  return items;
}

function renderCollection() {
  const items = filteredRecipes();
  $('#resultsCount').textContent = `${fa(items.length)} دستور پیدا شد${query ? ` برای «${query}»` : ''}`;
  const shown = items.slice(0, visibleLimit);
  $('#recipeGrid').innerHTML = shown.map(cardMarkup).join('');
  $('#noResults').hidden = items.length !== 0;
  $('#loadMoreBtn').hidden = items.length <= visibleLimit;
  renderCategoryControls();
}

function renderPantry() {
  $('#pantryChips').innerHTML = pantry.length
    ? pantry.map((item, index) => `<span class="pantry-tag">${escapeHTML(item)}<button type="button" data-remove-pantry="${index}" aria-label="حذف ${escapeHTML(item)}">×</button></span>`).join('')
    : '<span class="empty-hint">هنوز ماده‌ای اضافه نکردی. چند ماده بنویس و دکمه افزودن رو بزن.</span>';
  $$('#equipmentOptions [data-equipment]').forEach(button => button.classList.toggle('active', equipment.has(button.dataset.equipment)));
}

function ingredientMatches(item) {
  const nItem = normalize(item);
  return pantry.some(p => {
    const nPantry = normalize(p);
    return nPantry && (nItem.includes(nPantry) || nPantry.includes(nItem));
  });
}

function pantryRecommendations() {
  const matches = getAllRecipes().map(recipe => {
    const matchedIngredients = (recipe.ingredients || []).filter(ingredientMatches);
    const required = recipe.equipment || [];
    const missingEquipment = equipment.size ? required.filter(item => !equipment.has(item)) : [];
    const equipmentBonus = equipment.size && required.length ? Math.max(0, required.length - missingEquipment.length) : 0;
    return { recipe, matchedIngredients, missingEquipment, score: matchedIngredients.length * 3 + equipmentBonus - missingEquipment.length * 0.3 };
  }).filter(item => item.matchedIngredients.length > 0)
    .sort((a, b) => b.score - a.score || a.recipe.time - b.recipe.time)
    .slice(0, 6);
  return matches;
}

function showPantryRecommendations() {
  if (!pantry.length) { toast('اول چند ماده اولیه وارد کن.', 'error'); $('#pantryInput').focus(); return; }
  const matches = pantryRecommendations();
  const target = $('#pantryResults');
  target.hidden = false;
  if (!matches.length) {
    target.innerHTML = '<h3>هنوز پیشنهادی پیدا نشد</h3><p class="empty-hint">مواد بیشتری اضافه کن یا نام مواد رو ساده‌تر بنویس؛ مثلاً مرغ، تخم‌مرغ، سیب‌زمینی.</p>';
    return;
  }
  target.innerHTML = `<h3>با مواد تو، این غذاها رو می‌تونی درست کنی 👇</h3><div class="recipe-grid">${matches.slice(0, 3).map(({ recipe, matchedIngredients, missingEquipment }) => `<div class="pantry-match-card">${cardMarkup(recipe)}<div class="match-note">✓ ${fa(matchedIngredients.length)} ماده منطبق${missingEquipment.length ? ` · وسیله کم: ${escapeHTML(missingEquipment.join('، '))}` : ' · وسایل مناسب'}</div></div>`).join('')}</div>`;
  target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderPlannerPreview() {
  $('#weekPreview').innerHTML = DAYS.map(day => {
    const planned = planner[day];
    return `<div class="week-day${planned ? ' has-meal' : ''}"><span>${day}</span><strong title="${escapeHTML(planned?.title || 'هنوز انتخاب نشده')}">${planned ? escapeHTML(planned.title) : '—'}</strong></div>`;
  }).join('');
}

function setCategory(category) {
  activeCategory = category;
  visibleLimit = 12;
  renderCollection();
  $('#collection').scrollIntoView({ behavior: 'smooth' });
}

function toggleFavorite(id) {
  if (favorites.has(id)) { favorites.delete(id); toast('از علاقه‌مندی‌ها حذف شد.'); }
  else { favorites.add(id); toast('به علاقه‌مندی‌ها اضافه شد ♥'); }
  writeStore(STORE.favorites, [...favorites]);
  renderTrends(); renderCollection();
  if ($('#modalBackdrop').classList.contains('open') && currentRecipe?.id === id) openRecipe(id);
}

function parseQuantity(text) {
  const normalized = String(text).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const match = normalized.match(/^\s*(\d+(?:\.\d+|\/\d+)?)\s+(.+)$/);
  if (!match) return text;
  let number;
  if (match[1].includes('/')) { const [a, b] = match[1].split('/').map(Number); number = a / b; }
  else number = Number(match[1]);
  return `${fa(Number((number * currentServings / Math.max(1, currentRecipe?.servings || 1)).toFixed(2)))} ${match[2]}`;
}

function openRecipe(id) {
  const recipe = findRecipe(id);
  if (!recipe) return;
  currentRecipe = recipe;
  currentServings = recipe.servings || 2;
  const isFavorite = favorites.has(id);
  const equipmentText = recipe.equipment?.length ? recipe.equipment.join('، ') : 'نیاز خاصی ندارد';
  $('#modalContent').innerHTML = `<div class="recipe-detail-hero">${imageMarkup(recipe)}<div class="detail-hero-overlay"></div><div class="detail-hero-copy"><span class="detail-category">${escapeHTML(recipe.cuisine || categoryName(recipe.category))} · ${escapeHTML(categoryName(recipe.category))}</span><h2 id="modalTitle">${escapeHTML(recipe.title)}</h2><p>${escapeHTML(recipe.subtitle || '')}</p></div></div>
    <div class="detail-content"><div class="detail-stats"><span class="detail-stat">⏱ زمان <strong>${fa(recipe.time || 30)} دقیقه</strong></span><span class="detail-stat">♨️ سختی <strong>${escapeHTML(recipe.difficulty || 'آسان')}</strong></span><span class="detail-stat">🍽 کالری تقریبی <strong>${recipe.calories ? fa(recipe.calories) : '—'}</strong></span><span class="detail-stat">🧰 وسایل <strong>${escapeHTML(equipmentText)}</strong></span></div>
    <div class="detail-columns"><div><h3>مواد لازم</h3><div class="servings-control"><span>تعداد نفرات</span><div class="stepper"><button data-servings="-1" type="button">−</button><strong id="servingValue">${fa(currentServings)}</strong><button data-servings="1" type="button">＋</button></div></div><ul class="ingredient-list" id="ingredientList">${recipe.ingredients.map(item => `<li>${escapeHTML(parseQuantity(item))}</li>`).join('')}</ul><div class="detail-actions"><button class="btn btn-dark" data-add-shopping="${escapeHTML(id)}">＋ افزودن مواد به لیست خرید</button><button class="btn btn-outline" data-detail-favorite="${escapeHTML(id)}">${isFavorite ? '♥ ذخیره شده' : '♡ علاقه‌مندی'}</button></div>${recipe.userCreated ? `<div class="detail-actions"><button class="btn btn-outline" data-edit="${escapeHTML(id)}">✎ ویرایش دستور</button><button class="btn btn-outline" data-delete="${escapeHTML(id)}">حذف دستور</button></div>` : recipe.external ? `<div class="detail-actions"><button class="btn btn-outline" data-save-online="${escapeHTML(id)}">＋ ذخیره در دستورهای من</button></div><div class="detail-source">منبع دستور آنلاین: TheMealDB · ${recipe.sourceURL ? `<a href="${escapeHTML(recipe.sourceURL)}" target="_blank" rel="noopener">مشاهده منبع ↗</a>` : 'نتیجه جستجوی آنلاین'}</div>` : ''}</div>
    <div><h3>مراحل پخت</h3><ol class="steps-list">${recipe.steps.map(step => `<li>${escapeHTML(step)}</li>`).join('')}</ol>${recipe.tip ? `<div class="recipe-tip"><strong>نکته چاشنی ✦</strong><br>${escapeHTML(recipe.tip)}</div>` : ''}<div class="form-field" style="margin-top:15px"><label for="plannerDaySelect">این غذا رو برای کدوم روز برنامه‌ریزی کنم؟</label><div style="display:flex;gap:8px"><select id="plannerDaySelect" style="flex:1;border:1px solid #e5eae3;border-radius:10px;padding:9px;color:#173d32;background:#fbfcf9;font:inherit;font-size:10px">${DAYS.map(day => `<option value="${day}">${day}</option>`).join('')}</select><button class="btn btn-outline" data-plan-recipe="${escapeHTML(id)}">افزودن</button></div></div></div></div></div>`;
  showModal();
}

function showModal() {
  $('#modalBackdrop').classList.add('open');
  $('#modalBackdrop').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modalBackdrop').classList.remove('open');
  $('#modalBackdrop').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  currentRecipe = null;
}

function addShoppingItems(recipe) {
  let added = 0;
  recipe.ingredients.forEach(item => {
    const text = parseQuantity(item);
    if (!shoppingList.some(entry => normalize(entry.text) === normalize(text))) {
      shoppingList.push({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, text, done: false });
      added++;
    }
  });
  writeStore(STORE.shopping, shoppingList);
  updateShoppingCount();
  toast(added ? `${fa(added)} قلم به لیست خرید اضافه شد.` : 'مواد این دستور قبلاً در لیست خریدت هست.');
}

function updateShoppingCount() {
  $('#shoppingCount').textContent = fa(shoppingList.filter(item => !item.done).length);
}

function openShopping() {
  $('#modalContent').innerHTML = `<div class="shopping-modal"><h2 id="modalTitle">لیست خرید من 🛒</h2><p>مواد لازم رو تیک بزن؛ موارد انجام‌شده از شمارنده کم می‌شن.</p><div class="shopping-list" id="shoppingListContent">${shoppingMarkup()}</div><div class="shopping-actions"><button class="clear-link" id="clearDoneShopping">پاک کردن موارد انجام‌شده</button><button class="btn btn-dark" id="closeShopping">بستن لیست</button></div></div>`;
  showModal();
}
function shoppingMarkup() {
  if (!shoppingList.length) return '<div class="shopping-empty">لیستت خالیه. از داخل یک دستور، مواد لازم رو به لیست خرید اضافه کن. 🥬</div>';
  return shoppingList.map(item => `<label class="shopping-item${item.done ? ' done' : ''}"><input type="checkbox" data-shopping-check="${escapeHTML(item.id)}" ${item.done ? 'checked' : ''}><span>${escapeHTML(item.text)}</span><button type="button" data-shopping-remove="${escapeHTML(item.id)}" style="margin-right:auto;border:0;background:none;color:#a1aaa3">×</button></label>`).join('');
}

function openPlanner() {
  const options = getAllRecipes().filter(r => !r.external);
  $('#modalContent').innerHTML = `<div class="planner-modal"><h2 id="modalTitle">برنامه غذایی هفته 📅</h2><p>برای هر روز یک غذا انتخاب کن. انتخاب‌ها فقط در همین مرورگر ذخیره می‌شن.</p><div class="planner-day-list">${DAYS.map(day => `<div class="planner-day-row"><strong>${day}</strong><select data-plan-select="${day}" style="max-width:65%;border:1px solid #e5eae3;border-radius:8px;padding:7px;background:#fff;color:#173d32;font:inherit;font-size:9px"><option value="">بدون برنامه</option>${options.map(r => `<option value="${r.id}" ${planner[day]?.id === r.id ? 'selected' : ''}>${escapeHTML(r.title)}</option>`).join('')}</select></div>`).join('')}</div><div class="form-actions" style="margin-top:18px"><button class="btn btn-dark" id="savePlanner">ذخیره برنامه</button><button class="btn btn-outline" id="clearPlanner">پاک کردن برنامه</button></div></div>`;
  showModal();
}

function recipeFormMarkup(recipe = null) {
  const editing = Boolean(recipe);
  const ingredients = recipe?.ingredients?.join('\n') || '';
  const steps = recipe?.steps?.join('\n') || '';
  $('#modalContent').innerHTML = `<form class="form-modal" id="recipeForm"><h2 id="modalTitle">${editing ? 'ویرایش دستور' : 'دستور جدید خودت رو ثبت کن'} ✍️</h2><p>دستور شخصی تو روی همین دستگاه ذخیره می‌شه و هر زمان می‌تونی ویرایشش کنی.</p>
    <div class="form-grid"><div class="form-field full"><label for="recipeTitle">نام غذا *</label><input id="recipeTitle" name="title" required maxlength="70" value="${escapeHTML(recipe?.title || '')}" placeholder="مثلاً پاستا مخصوص من"></div>
    <div class="form-field"><label for="recipeCategory">دسته‌بندی</label><select id="recipeCategory" name="category">${categories.filter(c => c.id !== 'all').map(c => `<option value="${c.id}" ${recipe?.category === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>
    <div class="form-field"><label for="recipeCuisine">سبک یا کشور</label><input id="recipeCuisine" name="cuisine" value="${escapeHTML(recipe?.cuisine || 'خانگی')}" placeholder="مثلاً ایرانی"></div>
    <div class="form-field"><label for="recipeTime">زمان آماده‌سازی و پخت (دقیقه)</label><input id="recipeTime" name="time" type="number" min="1" max="1440" value="${recipe?.time || 30}"></div>
    <div class="form-field"><label for="recipeServings">تعداد نفرات</label><input id="recipeServings" name="servings" type="number" min="1" max="40" value="${recipe?.servings || 2}"></div>
    <div class="form-field"><label for="recipeDifficulty">سختی</label><select id="recipeDifficulty" name="difficulty"><option ${recipe?.difficulty === 'آسان' ? 'selected' : ''}>آسان</option><option ${recipe?.difficulty === 'متوسط' ? 'selected' : ''}>متوسط</option><option ${recipe?.difficulty === 'سخت' ? 'selected' : ''}>سخت</option></select></div>
    <div class="form-field"><label for="recipeImage">لینک عکس (اختیاری)</label><input id="recipeImage" name="image" type="url" value="${escapeHTML(recipe?.image || '')}" placeholder="https://..."></div>
    <div class="form-field full"><label for="recipeEquipment">وسایل لازم (با ویرگول جدا کن، اختیاری)</label><input id="recipeEquipment" name="equipment" value="${escapeHTML((recipe?.equipment || []).join('، '))}" placeholder="مثلاً اجاق، فر، همزن"></div>
    <div class="form-field full"><label for="recipeIngredients">مواد لازم — هر ماده در یک خط *</label><textarea id="recipeIngredients" name="ingredients" required placeholder="2 عدد تخم‌مرغ\n1 پیمانه آرد\nبه مقدار لازم نمک">${escapeHTML(ingredients)}</textarea></div>
    <div class="form-field full"><label for="recipeSteps">مراحل پخت — هر مرحله در یک خط *</label><textarea id="recipeSteps" name="steps" required placeholder="مواد خشک را مخلوط کن.\nتخم‌مرغ را اضافه کن.\nدر فر بپز.">${escapeHTML(steps)}</textarea></div>
    <div class="form-field full"><label for="recipeTip">نکته یا فوت کوزه‌گری (اختیاری)</label><input id="recipeTip" name="tip" value="${escapeHTML(recipe?.tip || '')}" placeholder="مثلاً برای بافت بهتر، مواد هم‌دمای محیط باشند."></div>
    </div><div class="form-actions"><button class="btn btn-dark" type="submit">${editing ? 'ذخیره تغییرات' : 'ثبت دستور'}</button><button class="btn btn-outline" type="button" id="cancelRecipeForm">انصراف</button></div></form>`;
  showModal();
  $('#recipeForm').addEventListener('submit', event => saveRecipeForm(event, recipe?.id));
  $('#cancelRecipeForm').addEventListener('click', closeModal);
}

function saveRecipeForm(event, existingId) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const ingredients = String(form.get('ingredients')).split(/\n+/).map(s => s.trim()).filter(Boolean);
  const steps = String(form.get('steps')).split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (!ingredients.length || !steps.length) { toast('مواد لازم و مراحل پخت رو کامل کن.', 'error'); return; }
  const id = existingId || `user-${Date.now()}`;
  const recipe = {
    id, title: String(form.get('title')).trim(), subtitle: 'دستور ثبت‌شده توسط تو', category: String(form.get('category')),
    cuisine: String(form.get('cuisine') || 'خانگی').trim(), origin: 'دستور شخصی', time: Math.max(1, Number(form.get('time')) || 30), prep: 0,
    cook: Math.max(1, Number(form.get('time')) || 30), difficulty: String(form.get('difficulty')), servings: Math.max(1, Number(form.get('servings')) || 2),
    calories: 0, trend: false, tags: ['دستور شخصی'], equipment: String(form.get('equipment') || '').split(/[،,]+/).map(item => item.trim()).filter(Boolean), image: String(form.get('image') || '').trim() || 'assets/food-placeholder.svg',
    ingredients, steps, tip: String(form.get('tip') || '').trim(), userCreated: true
  };
  userRecipes = userRecipes.filter(item => item.id !== id);
  userRecipes.unshift(recipe);
  writeStore(STORE.recipes, userRecipes);
  closeModal(); renderAll(); toast(existingId ? 'دستور با موفقیت ویرایش شد.' : 'دستور جدیدت ثبت شد. نوش جان!');
}

function deleteRecipe(id) {
  if (!confirm('این دستور شخصی برای همیشه از این مرورگر حذف شود؟')) return;
  userRecipes = userRecipes.filter(r => r.id !== id);
  favorites.delete(id); delete plannerEntryById(id);
  writeStore(STORE.recipes, userRecipes); writeStore(STORE.favorites, [...favorites]); writeStore(STORE.planner, planner);
  closeModal(); renderAll(); toast('دستور حذف شد.');
}
function deletePlannerEntryById(id) { for (const day of DAYS) if (planner[day]?.id === id) delete planner[day]; }

function renderAll() {
  renderPantry(); renderTrends(); renderCollection(); renderPlannerPreview(); updateShoppingCount();
}

async function searchOnline(searchTerm) {
  const term = searchTerm.trim();
  if (term.length < 2) { toast('برای جستجوی آنلاین حداقل دو حرف وارد کن.', 'error'); return; }
  const button = $('#onlineSearchBtn');
  const oldText = button.textContent;
  button.disabled = true; button.textContent = 'در حال جستجو...';
  try {
    const response = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(term)}`);
    if (!response.ok) throw new Error('network');
    const payload = await response.json();
    const meals = payload.meals || [];
    const mapped = meals.map(meal => {
      const ingredients = [];
      for (let i = 1; i <= 20; i++) {
        const name = meal[`strIngredient${i}`]?.trim();
        const amount = meal[`strMeasure${i}`]?.trim();
        if (name) ingredients.push(`${amount ? `${amount} ` : ''}${name}`.trim());
      }
      return {
        id: `mealdb-${meal.idMeal}`, title: meal.strMeal, subtitle: `دستور آنلاین از ${meal.strArea || 'آشپزخانه جهان'}`,
        category: 'international', cuisine: meal.strArea || 'بین‌الملل', origin: meal.strArea || 'جهانی', time: 45, prep: 15, cook: 30,
        difficulty: 'متوسط', servings: 2, calories: 0, trend: false, tags: [meal.strCategory || 'غذای آنلاین'], equipment: [],
        image: meal.strMealThumb || 'assets/food-placeholder.svg', ingredients, steps: String(meal.strInstructions || '').split(/\r?\n|\.(?=\s|$)/).map(s => s.trim()).filter(s => s.length > 8),
        tip: '', external: true, sourceURL: meal.strSource || meal.strYoutube || ''
      };
    });
    onlineRecipes = mapped;
    query = term; activeCategory = 'all'; favoritesOnly = false; visibleLimit = 12;
    $('#searchInput').value = term; $('#favoritesFilter').classList.remove('active');
    renderCollection(); $('#collection').scrollIntoView({ behavior: 'smooth' });
    toast(mapped.length ? `${fa(mapped.length)} نتیجه آنلاین پیدا شد.` : 'برای این عبارت در منبع آنلاین نتیجه‌ای پیدا نشد.');
  } catch {
    toast('جستجوی آنلاین در دسترس نیست؛ اتصال اینترنت رو بررسی کن.', 'error');
  } finally {
    button.disabled = false; button.textContent = oldText;
  }
}

function bindEvents() {
  $('#searchForm').addEventListener('submit', event => {
    event.preventDefault(); query = $('#searchInput').value.trim(); activeCategory = 'all'; favoritesOnly = false; visibleLimit = 12;
    $('#favoritesFilter').classList.remove('active'); renderCollection(); $('#collection').scrollIntoView({ behavior: 'smooth' });
  });
  $('#onlineSearchBtn').addEventListener('click', () => searchOnline($('#searchInput').value));
  $$('.suggestion').forEach(button => button.addEventListener('click', () => {
    const term = button.dataset.search; $('#searchInput').value = term; query = term; activeCategory = 'all'; visibleLimit = 12; renderCollection(); $('#collection').scrollIntoView({ behavior: 'smooth' });
  }));
  $('#addRecipeOpen').addEventListener('click', () => recipeFormMarkup());
  $('#shoppingOpen').addEventListener('click', openShopping);
  $('#openPlanner').addEventListener('click', openPlanner);
  $('#mobileMenuBtn').addEventListener('click', () => $('#mainNav')?.classList.toggle('open'));
  $$('.quick-item').forEach(button => button.addEventListener('click', () => setCategory(button.dataset.category)));
  $('#addPantryItem').addEventListener('click', addPantryFromInput);
  $('#pantryInput').addEventListener('keydown', event => { if (event.key === 'Enter') addPantryFromInput(); });
  $('#clearPantry').addEventListener('click', () => { pantry = []; writeStore(STORE.pantry, pantry); renderPantry(); $('#pantryResults').hidden = true; });
  $('#findFromPantry').addEventListener('click', showPantryRecommendations);
  $('#sortSelect').addEventListener('change', event => { sortMode = event.target.value; renderCollection(); });
  $('#favoritesFilter').addEventListener('click', event => { favoritesOnly = !favoritesOnly; event.currentTarget.classList.toggle('active', favoritesOnly); renderCollection(); });
  $('#resetFilters').addEventListener('click', resetFilters);
  $('#noResultsReset').addEventListener('click', resetFilters);
  $('#loadMoreBtn').addEventListener('click', () => { visibleLimit += 12; renderCollection(); });
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalBackdrop').addEventListener('click', event => { if (event.target === $('#modalBackdrop')) closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

  document.addEventListener('click', event => {
    const categoryButton = event.target.closest('[data-category]');
    if (categoryButton) { setCategory(categoryButton.dataset.category); return; }
    const favoriteButton = event.target.closest('[data-favorite]');
    if (favoriteButton) { event.stopPropagation(); toggleFavorite(favoriteButton.dataset.favorite); return; }
    const editButton = event.target.closest('[data-edit]');
    if (editButton) { event.stopPropagation(); const recipe = findRecipe(editButton.dataset.edit); if (recipe?.userCreated) recipeFormMarkup(recipe); else toast('این دستور قابل ویرایش نیست.', 'error'); return; }
    const openCard = event.target.closest('[data-open]');
    if (openCard) { openRecipe(openCard.dataset.open); return; }
    const removePantry = event.target.closest('[data-remove-pantry]');
    if (removePantry) { pantry.splice(Number(removePantry.dataset.removePantry), 1); writeStore(STORE.pantry, pantry); renderPantry(); return; }
    const servingsButton = event.target.closest('[data-servings]');
    if (servingsButton && currentRecipe) {
      currentServings = Math.max(1, Math.min(40, currentServings + Number(servingsButton.dataset.servings)));
      $('#servingValue').textContent = fa(currentServings);
      $('#ingredientList').innerHTML = currentRecipe.ingredients.map(item => `<li>${escapeHTML(parseQuantity(item))}</li>`).join(''); return;
    }
    const addShopping = event.target.closest('[data-add-shopping]');
    if (addShopping) { const recipe = findRecipe(addShopping.dataset.addShopping); if (recipe) addShoppingItems(recipe); return; }
    const detailFavorite = event.target.closest('[data-detail-favorite]');
    if (detailFavorite) { toggleFavorite(detailFavorite.dataset.detailFavorite); return; }
    const saveOnline = event.target.closest('[data-save-online]');
    if (saveOnline) {
      const source = findRecipe(saveOnline.dataset.saveOnline);
      if (source) {
        const copy = { ...source, id: `user-${Date.now()}`, subtitle: 'ذخیره‌شده از دستور آنلاین', userCreated: true, external: false, trend: false };
        userRecipes.unshift(copy); writeStore(STORE.recipes, userRecipes); renderAll(); toast('دستور آنلاین به دفتر شخصی‌ات اضافه شد.'); closeModal();
      }
      return;
    }
    const planRecipe = event.target.closest('[data-plan-recipe]');
    if (planRecipe) {
      const day = $('#plannerDaySelect').value; const recipe = findRecipe(planRecipe.dataset.planRecipe);
      planner[day] = { id: recipe.id, title: recipe.title }; writeStore(STORE.planner, planner); renderPlannerPreview(); toast(`${recipe.title} برای ${day} ثبت شد.`); return;
    }
    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) { deleteRecipe(deleteButton.dataset.delete); return; }
    const shoppingRemove = event.target.closest('[data-shopping-remove]');
    if (shoppingRemove) { shoppingList = shoppingList.filter(item => item.id !== shoppingRemove.dataset.shoppingRemove); writeStore(STORE.shopping, shoppingList); updateShoppingCount(); $('#shoppingListContent').innerHTML = shoppingMarkup(); return; }
    const closeShopping = event.target.closest('#closeShopping');
    if (closeShopping) { closeModal(); return; }
    const clearDone = event.target.closest('#clearDoneShopping');
    if (clearDone) { shoppingList = shoppingList.filter(item => !item.done); writeStore(STORE.shopping, shoppingList); updateShoppingCount(); $('#shoppingListContent').innerHTML = shoppingMarkup(); return; }
    const savePlanner = event.target.closest('#savePlanner');
    if (savePlanner) {
      $$('[data-plan-select]').forEach(select => {
        const recipe = findRecipe(select.value);
        if (recipe) planner[select.dataset.planSelect] = { id: recipe.id, title: recipe.title };
        else delete planner[select.dataset.planSelect];
      });
      writeStore(STORE.planner, planner); renderPlannerPreview(); closeModal(); toast('برنامه غذایی هفته ذخیره شد.'); return;
    }
    const clearPlanner = event.target.closest('#clearPlanner');
    if (clearPlanner) { planner = {}; writeStore(STORE.planner, planner); renderPlannerPreview(); closeModal(); toast('برنامه هفتگی پاک شد.'); }
  });

  document.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-shopping-check]');
    if (checkbox) {
      const item = shoppingList.find(entry => entry.id === checkbox.dataset.shoppingCheck);
      if (item) item.done = checkbox.checked;
      writeStore(STORE.shopping, shoppingList); updateShoppingCount(); $('#shoppingListContent').innerHTML = shoppingMarkup(); return;
    }
    const select = event.target.closest('[data-plan-select]');
    if (select) { /* changes are committed with the save button */ }
  });

  $$('#equipmentOptions [data-equipment]').forEach(button => button.addEventListener('click', () => {
    const item = button.dataset.equipment;
    if (equipment.has(item)) equipment.delete(item); else equipment.add(item);
    writeStore(STORE.equipment, [...equipment]); renderPantry();
  }));
}

function addPantryFromInput() {
  const input = $('#pantryInput');
  const values = input.value.split(/[،,؛;]+/).map(value => value.trim()).filter(Boolean);
  let added = 0;
  values.forEach(value => { if (!pantry.some(item => normalize(item) === normalize(value))) { pantry.push(value); added++; } });
  input.value = ''; writeStore(STORE.pantry, pantry); renderPantry(); $('#pantryResults').hidden = true;
  if (added) toast(`${fa(added)} ماده به موجودی اضافه شد.`);
}

function resetFilters() {
  query = ''; activeCategory = 'all'; favoritesOnly = false; visibleLimit = 12;
  $('#searchInput').value = ''; $('#favoritesFilter').classList.remove('active'); $('#sortSelect').value = 'recommended'; sortMode = 'recommended';
  renderCollection();
}

// Boot the app.
$('#currentYear').textContent = new Date().getFullYear();
// Give the mobile menu its stable selector without changing the semantic nav markup.
$('.main-nav').id = 'mainNav';
bindEvents();
renderAll();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
