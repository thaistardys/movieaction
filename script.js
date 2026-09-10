const firebaseConfig = {
  apiKey: "AIzaSyATJLdOEAUrAVRDbzk0HLftBrnUyHv6hwY",
  authDomain: "://firebaseapp.com",
  projectId: "movie-action-bb4d4",
  storageBucket: "movie-action-bb4d4.firebasestorage.app",
  messagingSenderId: "602040101255",
  appId: "1:602040101255:web:2ad65f357829d6f9ed0b22"
};

const WEEK_TITLES = {
  1: "Estreias & Adrenalina",
  2: "Clássicos & Perseguição",
  3: "Suspense & Velocidade",
  4: "Grandes Missões & Finais"
};

const MAX_SYNOPSIS = 160;
const LOCAL_AUTH_CACHE_KEY = 'movie_action_auth_cached';

function parseWeekSearch(term) {
  const clean = term.toLowerCase().trim();
  const match = clean.match(/^semana\s*0*(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

function groupMoviesByWeek(moviesList) {
  const grouped = {};
  moviesList.forEach(movie => {
    const week = movie.weekNumber || 1;
    if (!grouped[week]) grouped[week] = [];
    grouped[week].push(movie);
  });
  return Object.keys(grouped).sort((a, b) => a - b).map(weekNum => ({
    weekNumber: parseInt(weekNum, 10),
    weekTitle: WEEK_TITLES[weekNum] || `Semana ${weekNum}`,
    movies: grouped[weekNum]
  }));
}

function resolveCoverUrl(movie) {
  const titleDisplay = movie.title ? movie.title.split(' ') : 'Filme';
  const fallbackSvg = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://w3.org' width='500' height='750' viewBox='0 0 500 750'%3E%3Crect width='500' height='750' fill='%23ede5da'/%3E%3Ctext x='50%25' y='48%25' fill='%23f9886c' font-family='Arial' font-weight='bold' font-size='32' text-anchor='middle' dominant-baseline='middle'%3E${encodeURIComponent(titleDisplay)}%3C/text%3E%3Ctext x='50%25' y='55%25' fill='%238ec3b0' font-size='48' text-anchor='middle' dominant-baseline='middle'%3E%F0%9F%8E%AC%3C/text%3E%3C/svg%3E`;

  if (!movie.cover || movie.cover.trim() === '') return fallbackSvg;
  let cleanCover = movie.cover.trim();
  
  // Resolução do link do ecossistema Google Share via Weserv Proxy
  if (cleanCover.includes('share.google') || cleanCover.startsWith('http://') || cleanCover.startsWith('https://')) {
    return `https://weserv.nl{encodeURIComponent(cleanCover)}&default=${encodeURIComponent(fallbackSvg)}`;
  }
  return cleanCover;
}

document.addEventListener('DOMContentLoaded', () => {
  // Trava de segurança desativada para conexões lentas ou com bloqueio de CDNs externas
  if (typeof firebase === 'undefined') {
    console.warn("Firebase SDK pendente de sincronização de rede.");
  } else if (!firebase.apps.length) { 
    firebase.initializeApp(firebaseConfig); 
  }

  const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;
  const db = typeof firebase !== 'undefined' ? firebase.firestore() : null;

  // Seletores do Painel de Login e Menu Superior
  const loginSection = document.querySelector('#login-section');
  const loginCard = document.querySelector('#login-card');
  const loginForm = document.querySelector('#login-form');
  const loginUser = document.querySelector('#login-user');
  const loginPass = document.querySelector('#login-pass');
  const loginFeedback = document.querySelector('#login-feedback');
  const appWrapper = document.querySelector('#app-wrapper');
  const btnLogout = document.querySelector('#btn-logout');

  const weeksContainer = document.querySelector('#weeks-container');
  const btnLoadMore = document.querySelector('#btn-load-more');
  const loadMoreWrapper = document.querySelector('#load-more-wrapper');
  const progressBar = document.querySelector('#progress-bar');
  const progressText = document.querySelector('#progress-text');
  const victoryModal = document.querySelector('#victory-modal');
  const btnCloseModal = document.querySelector('#btn-close-modal');
  const searchInput = document.querySelector('#search-input');
  const btnClearSearch = document.querySelector('#btn-clear-search');
  const movieFormModal = document.querySelector('#movie-form-modal');
  const movieForm = document.querySelector('#movie-form');
  const btnOpenAddModal = document.querySelector('#btn-open-add-modal');
  const btnCancelForm = document.querySelector('#btn-cancel-form');
  const formModalTitle = document.querySelector('#form-modal-title');

  const inputId = document.querySelector('#movie-id');
  const inputTitle = document.querySelector('#movie-title-input');
  const inputCover = document.querySelector('#movie-cover-input');
  const inputWeek = document.querySelector('#movie-week-input');
  const inputDay = document.querySelector('#movie-day-input');
  const inputGenre = document.querySelector('#movie-genre-input');
  const inputSynopsis = document.querySelector('#movie-synopsis-input');
  const synopsisCounter = document.querySelector('#synopsis-counter');

  const deleteModal = document.querySelector('#delete-confirm-modal');
  const deleteModalText = document.querySelector('#delete-modal-text');
  const btnCancelDelete = document.querySelector('#btn-cancel-delete');
  const btnConfirmDelete = document.querySelector('#btn-confirm-delete');

  // Seletores dos Modais de Autenticação Secundários
  const forgotModal = document.querySelector('#forgot-password-modal');
  const forgotForm = document.querySelector('#forgot-password-form');
  const forgotEmail = document.querySelector('#forgot-email');
  const forgotFeedback = document.querySelector('#forgot-feedback');
  const btnLinkForgotPass = document.querySelector('#link-forgot-pass');
  const btnCancelForgot = document.querySelector('#btn-cancel-forgot');

  const registerModal = document.querySelector('#register-modal');
  const registerForm = document.querySelector('#register-form');
  const registerEmail = document.querySelector('#register-email');
  const registerPass = document.querySelector('#register-pass');
  const registerFeedback = document.querySelector('#register-feedback');
  const btnLinkCreateAccount = document.querySelector('#link-create-account');
  const btnCancelRegister = document.querySelector('#btn-cancel-register');
  
  let currentMovies = [];
  let visibleWeeks = 1;
  let searchQuery = '';
  let movieToDeleteId = null;

  if (localStorage.getItem(LOCAL_AUTH_CACHE_KEY) === 'true') {
    appWrapper.classList.remove('is-hidden'); loginSection.classList.add('is-hidden');
  }

  if (auth) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        localStorage.setItem(LOCAL_AUTH_CACHE_KEY, 'true');
        loginSection.classList.add('is-hidden'); appWrapper.classList.remove('is-hidden');
        listenToFirestoreMovies();
      } else {
        localStorage.removeItem(LOCAL_AUTH_CACHE_KEY);
        appWrapper.classList.add('is-hidden'); loginSection.classList.remove('is-hidden');
      }
    });
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!auth) { loginFeedback.textContent = "Serviço indisponível no momento."; loginFeedback.className = "login-feedback is-error"; return; }
    auth.signInWithEmailAndPassword(loginUser.value.trim(), loginPass.value.trim())
      .then(() => {
        loginFeedback.textContent = "Acesso autorizado! Bem-vindo(a) ✨"; loginFeedback.className = "login-feedback is-success";
        loginCard.classList.add('is-success'); triggerWelcomeConfetti();
        setTimeout(() => { loginCard.classList.remove('is-success'); loginFeedback.textContent = ""; loginForm.reset(); }, 1000);
      })
      .catch(() => {
        loginFeedback.textContent = "E-mail ou senha incorretos. Tente novamente."; loginFeedback.className = "login-feedback is-error";
        loginCard.classList.add('is-shaking'); setTimeout(() => loginCard.classList.remove('is-shaking'), 600);
      });
  });

  btnLogout.addEventListener('click', () => { localStorage.removeItem(LOCAL_AUTH_CACHE_KEY); if (auth) auth.signOut(); });

  function triggerWelcomeConfetti() { console.log("Animação suspensa para estabilidade de rede."); }

  function listenToFirestoreMovies() { if (db) db.collection('movies').onSnapshot(s => { currentMovies = []; s.forEach(doc => currentMovies.push({ id: doc.id, ...doc.data() })); renderApp(); }); }

  function updateSynopsisCounter() {
    const len = inputSynopsis.value.length; synopsisCounter.textContent = `${len} / ${MAX_SYNOPSIS}`;
    if (len >= MAX_SYNOPSIS) synopsisCounter.classList.add('limit-reached'); else synopsisCounter.classList.remove('limit-reached');
  }
  inputSynopsis.addEventListener('input', updateSynopsisCounter);
  function renderApp() {
    weeksContainer.replaceChildren();
    const marathonData = groupMoviesByWeek(currentMovies);
    const term = searchQuery.toLowerCase().trim();
    const targetWeek = parseWeekSearch(term);

    if (currentMovies.length === 0) {
      const emptyDiv = document.createElement('div'); emptyDiv.className = 'no-results';
      emptyDiv.innerHTML = `<p>Nenhum filme cadastrado na maratona ainda 🎬</p><p class="empty-state-subtitle">Clique no botão <strong>"Novo Filme ➕"</strong> acima para começar!</p>`;
      weeksContainer.appendChild(emptyDiv); loadMoreWrapper.classList.add('is-hidden'); updateProgress(0, 0); return;
    }

    loadMoreWrapper.classList.toggle('is-hidden', term !== '' || visibleWeeks >= marathonData.length);
    let totalMatches = 0, watchedCount = 0;
    currentMovies.forEach(m => { if (m.watched) watchedCount++; });

    marathonData.forEach((week, index) => {
      if (term === '' && index >= visibleWeeks) return;
      let filteredMovies = week.movies;
      if (term !== '') {
        if (targetWeek !== null) { if (week.weekNumber !== targetWeek) return; }
        else { filteredMovies = week.movies.filter(movie => movie.title.toLowerCase().includes(term) || movie.genre.toLowerCase().includes(term)); if (filteredMovies.length === 0) return; }
      }
      totalMatches += filteredMovies.length;

      const weekEl = document.createElement('section'); weekEl.className = 'week-container';
      weekEl.innerHTML = `<div class="week-header"><h2 class="week-title">Semana 0${week.weekNumber}: ${week.weekTitle}</h2><span class="week-badge">${filteredMovies.length} Filme(s)</span></div><div class="movies-grid"></div>`;
      const grid = weekEl.querySelector('.movies-grid');

      filteredMovies.forEach(movie => {
        const isWatched = Boolean(movie.watched);
        const card = document.createElement('article'); card.className = `movie-card ${isWatched ? 'is-watched' : ''}`;
        card.innerHTML = `
          <span class="card-day-tag">📅 ${movie.day}</span>
          <div class="card-admin-actions">
            <button type="button" class="btn-card-util btn-edit-movie" data-id="${movie.id}">✏️</button>
            <button type="button" class="btn-card-util btn-delete-movie" data-id="${movie.id}">🗑️</button>
          </div>
          <div class="poster-container"><img src="${resolveCoverUrl(movie)}" alt="Poster" class="poster-img" loading="lazy" referrerpolicy="no-referrer"></div>
          <div class="card-body">
            <span class="genre-badge">${movie.genre}</span><h3 class="movie-title">${movie.title}</h3><p class="movie-synopsis">${movie.synopsis}</p>
            <div class="button-group">
              <button type="button" class="btn-action btn-watched ${isWatched ? 'active-watched' : ''}" data-id="${movie.id}">Assisti ✔</button>
              <button type="button" class="btn-action btn-unwatched ${!isWatched ? 'active-unwatched' : ''}" data-id="${movie.id}">Não assisti ✕</button>
            </div>
          </div>`;
        grid.appendChild(card);
      });
      weeksContainer.appendChild(weekEl);
    });
    updateProgress(watchedCount, currentMovies.length);
  }

  weeksContainer.addEventListener('click', (e) => {
    if (!db) return;
    const btnAction = e.target.closest('.btn-action');
    if (btnAction) { db.collection('movies').doc(btnAction.dataset.id).update({ watched: btnAction.classList.contains('btn-watched') }); return; }

    const btnEdit = e.target.closest('.btn-edit-movie');
    if (btnEdit) {
      const movie = currentMovies.find(m => m.id === btnEdit.dataset.id); if (!movie) return;
      formModalTitle.textContent = "Editar Filme"; inputId.value = movie.id; inputTitle.value = movie.title;
      inputCover.value = movie.cover || ''; inputWeek.value = movie.weekNumber || 1; inputDay.value = movie.day;
      inputGenre.value = movie.genre; inputSynopsis.value = movie.synopsis; updateSynopsisCounter();
      movieFormModal.classList.add('is-active'); return;
    }

    const btnDelete = e.target.closest('.btn-delete-movie');
    if (btnDelete) { movieToDeleteId = btnDelete.dataset.id; deleteModal.classList.add('is-active'); }
  });

  btnConfirmDelete.addEventListener('click', () => { if (db && movieToDeleteId) db.collection('movies').doc(movieToDeleteId).delete().then(() => { deleteModal.classList.remove('is-active'); }); });
  btnCancelDelete.addEventListener('click', () => deleteModal.classList.remove('is-active'));

  movieForm.addEventListener('submit', (e) => {
    e.preventDefault(); if (!db) return; const id = inputId.value;
    const data = { title: inputTitle.value.trim(), cover: inputCover.value.trim(), weekNumber: parseInt(inputWeek.value, 10), day: inputDay.value.trim(), genre: inputGenre.value.trim(), synopsis: inputSynopsis.value.trim() };
    if (id) { db.collection('movies').doc(id).update(data).then(() => movieFormModal.classList.remove('is-active')); }
    else { data.watched = false; data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); db.collection('movies').add(data).then(() => movieFormModal.classList.remove('is-active')); }
  });

  btnOpenAddModal.addEventListener('click', () => { movieForm.reset(); inputId.value = ''; formModalTitle.textContent = "Novo Filme"; updateSynopsisCounter(); movieFormModal.classList.add('is-active'); });
  btnCancelForm.addEventListener('click', () => movieFormModal.classList.remove('is-active'));

  function updateProgress(w, t) { const p = t > 0 ? Math.round((w / t) * 100) : 0; progressBar.style.width = `${p}%`; progressText.textContent = `${w} / ${t} assistidos (${p}%)`; if (t > 0 && w === t) { setTimeout(() => victoryModal.classList.add('is-active'), 1000); } }

  searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; btnClearSearch.classList.toggle('is-active', !!searchQuery); renderApp(); });
  btnClearSearch.addEventListener('click', () => { searchInput.value = ''; searchQuery = ''; btnClearSearch.classList.remove('is-active'); renderApp(); searchInput.focus(); });
  btnLoadMore.addEventListener('click', () => { visibleWeeks++; renderApp(); });
  btnCloseModal.addEventListener('click', () => victoryModal.classList.remove('is-active'));

  // --- AMARRAÇÃO DOS ELEMENTOS E EVENTOS DE ENTRADA CORRIGIDOS ---
  const initAuthActions = () => {
    if (!btnLinkForgotPass || !btnLinkCreateAccount) return;

    btnLinkForgotPass.addEventListener('click', (e) => {
      e.preventDefault();
      if (forgotForm) forgotForm.reset();
      if (forgotFeedback) { forgotFeedback.textContent = ''; forgotFeedback.className = ''; }
      if (forgotModal) forgotModal.classList.add('is-active');
    });

    if (btnCancelForgot) btnCancelForgot.addEventListener('click', () => { if (forgotModal) forgotModal.classList.remove('is-active'); });

    if (forgotForm) {
      forgotForm.addEventListener('submit', (e) => {
        e.preventDefault(); if (!auth) return;
        auth.sendPasswordResetEmail(forgotEmail.value.trim())
          .then(() => {
            forgotFeedback.textContent = "E-mail de reset de senha enviado. Favor verifique sua caixa de entrada ou sua caixa de spam";
            forgotFeedback.className = "is-success";
            setTimeout(() => { if (forgotModal) forgotModal.classList.remove('is-active'); }, 5000);
          })
          .catch(() => { forgotFeedback.textContent = "Erro ao enviar e-mail. Verifique o endereço."; forgotFeedback.className = "is-error"; });
      });
    }

    btnLinkCreateAccount.addEventListener('click', (e) => {
      e.preventDefault();
      if (registerForm) registerForm.reset();
      if (registerFeedback) { registerFeedback.textContent = ''; registerFeedback.className = ''; }
      if (registerModal) registerModal.classList.add('is-active');
    });

    if (btnCancelRegister) btnCancelRegister.addEventListener('click', () => { if (registerModal) registerModal.classList.remove('is-active'); });

    if (registerForm) {
      registerForm.addEventListener('submit', (e) => {
        e.preventDefault(); if (!auth) return;
        if (registerPass.value.trim().length < 6) { registerFeedback.textContent = "A senha deve conter pelo menos 6 caracteres."; registerFeedback.className = "is-error"; return; }
        auth.createUserWithEmailAndPassword(registerEmail.value.trim(), registerPass.value.trim())
          .then(() => { registerFeedback.textContent = "Conta criada com sucesso! Entrando..."; registerFeedback.className = "is-success"; setTimeout(() => { if (registerModal) registerModal.classList.remove('is-active'); }, 1500); })
          .catch(err => { registerFeedback.textContent = err.code === 'auth/email-already-in-use' ? "Este e-mail já está em uso." : "Erro ao criar conta."; registerFeedback.className = "is-error"; });
      });
    }
  };

  initAuthActions();
});
