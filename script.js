const firebaseConfig = {
  apiKey: "AIzaSyATJLdOEAUrAVRDbzk0HLftBrnUyHv6hwY",
  authDomain: "movie-action-bb4d4.firebaseapp.com",
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

/**
 * [RECURSO TÉCNICO NECESSÁRIO]: 
 * Tratamento de CORS com proxy para URLs externas e fallback local em SVG Pastel.
 */
function resolveCoverUrl(movie) {
  const titleDisplay = movie.title.split(' ')[0];
  const fallbackSvg = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='750' viewBox='0 0 500 750'%3E%3Crect width='500' height='750' fill='%23ede5da'/%3E%3Ctext x='50%25' y='48%25' fill='%23f9886c' font-family='Arial' font-weight='bold' font-size='32' text-anchor='middle' dominant-baseline='middle'%3E${encodeURIComponent(titleDisplay)}%3C/text%3E%3Ctext x='50%25' y='55%25' fill='%238ec3b0' font-size='48' text-anchor='middle' dominant-baseline='middle'%3E%F0%9F%8E%AC%3C/text%3E%3C/svg%3E`;

  if (!movie.cover || movie.cover.trim() === '') {
    return fallbackSvg;
  }
  const cleanCover = movie.cover.trim();
  if (cleanCover.startsWith('http://') || cleanCover.startsWith('https://')) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(cleanCover)}&default=${encodeURIComponent(fallbackSvg)}`;
  }
  return cleanCover;
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof firebase === 'undefined') {
    console.error("Firebase SDK não carregou! Verifique os scripts no index.html.");
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const auth = firebase.auth();
  const db = firebase.firestore();

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
  
  let currentMovies = [];
  let visibleWeeks = 1;
  let searchQuery = '';
  let movieToDeleteId = null;

  if (localStorage.getItem(LOCAL_AUTH_CACHE_KEY) === 'true') {
    appWrapper.classList.remove('is-hidden');
    loginSection.classList.add('is-hidden');
  }

  auth.onAuthStateChanged((user) => {
    if (user) {
      localStorage.setItem(LOCAL_AUTH_CACHE_KEY, 'true');
      loginSection.classList.add('is-hidden');
      appWrapper.classList.remove('is-hidden');
      listenToFirestoreMovies();
    } else {
      localStorage.removeItem(LOCAL_AUTH_CACHE_KEY);
      appWrapper.classList.add('is-hidden');
      loginSection.classList.remove('is-hidden');
    }
  });

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginUser.value.trim();
    const pass = loginPass.value.trim();

    auth.signInWithEmailAndPassword(email, pass)
      .then(() => {
        loginFeedback.textContent = "Acesso autorizado! Bem-vindo(a) ✨";
        loginFeedback.className = "login-feedback is-success";
        loginCard.classList.add('is-success');
        triggerWelcomeConfetti();

        setTimeout(() => {
          loginCard.classList.remove('is-success');
          loginFeedback.textContent = "";
          loginFeedback.className = "login-feedback";
          loginForm.reset();
        }, 1000);
      })
      .catch((error) => {
        console.warn("Falha no login:", error.code, error.message);
        loginFeedback.textContent = "E-mail ou senha incorretos. Tente novamente.";
        loginFeedback.className = "login-feedback is-error";
        loginCard.classList.add('is-shaking');

        setTimeout(() => loginCard.classList.remove('is-shaking'), 600);
      });
  });

  btnLogout.addEventListener('click', () => {
    localStorage.removeItem(LOCAL_AUTH_CACHE_KEY);
    auth.signOut();
  });

  function triggerWelcomeConfetti() {
    if (typeof confetti !== 'function') return;
    confetti({
      particleCount: 60,
      spread: 90,
      origin: { y: 0.6 },
      colors: ['#f9886c', '#8ec3b0', '#b8a7ea', '#ffece6']
    });
  }

  function listenToFirestoreMovies() {
    db.collection('movies').onSnapshot((snapshot) => {
      currentMovies = [];
      snapshot.forEach(doc => {
        currentMovies.push({ id: doc.id, ...doc.data() });
      });
      renderApp();
    }, (error) => {
      console.error("Erro ao sincronizar com Firestore:", error);
    });
  }

  function updateSynopsisCounter() {
    const currentLength = inputSynopsis.value.length;
    synopsisCounter.textContent = `${currentLength} / ${MAX_SYNOPSIS}`;

    if (currentLength >= MAX_SYNOPSIS) {
      synopsisCounter.classList.add('limit-reached');
    } else {
      synopsisCounter.classList.remove('limit-reached');
    }
  }

  inputSynopsis.addEventListener('input', updateSynopsisCounter);

  function renderApp() {
    weeksContainer.replaceChildren();

    const marathonData = groupMoviesByWeek(currentMovies);
    const term = searchQuery.toLowerCase().trim();
    const targetWeek = parseWeekSearch(term);

    if (currentMovies.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'no-results';
      emptyDiv.innerHTML = `
        <p>Nenhum filme cadastrado na maratona ainda 🎬</p>
        <p class="empty-state-subtitle">Clique no botão <strong>"Novo Filme ➕"</strong> acima para começar!</p>
      `;
      weeksContainer.appendChild(emptyDiv);
      loadMoreWrapper.classList.add('is-hidden');
      updateProgress(0, 0);
      return;
    }

    if (term !== '') {
      loadMoreWrapper.classList.add('is-hidden');
    } else {
      if (visibleWeeks >= marathonData.length) {
        loadMoreWrapper.classList.add('is-hidden');
      } else {
        loadMoreWrapper.classList.remove('is-hidden');
      }
    }

    let totalMatches = 0;
    let watchedCount = 0;

    currentMovies.forEach(m => {
      if (m.watched) watchedCount++;
    });

    marathonData.forEach((week, index) => {
      if (term === '' && index >= visibleWeeks) return;

      let filteredMovies = week.movies;

      if (term !== '') {
        if (targetWeek !== null) {
          if (week.weekNumber !== targetWeek) return;
        } else {
          filteredMovies = week.movies.filter(movie => 
            movie.title.toLowerCase().includes(term) ||
            movie.genre.toLowerCase().includes(term)
          );
          if (filteredMovies.length === 0) return;
        }
      }

      totalMatches += filteredMovies.length;

      const weekEl = document.createElement('section');
      weekEl.className = 'week-container';

      weekEl.innerHTML = `
        <div class="week-header">
          <h2 class="week-title">Semana 0${week.weekNumber}: ${week.weekTitle}</h2>
          <span class="week-badge">${filteredMovies.length} Filme(s)</span>
        </div>
        <div class="movies-grid"></div>
      `;

      const grid = weekEl.querySelector('.movies-grid');

      filteredMovies.forEach(movie => {
        const isWatched = Boolean(movie.watched);
        const resolvedCover = resolveCoverUrl(movie);

        const card = document.createElement('article');
        card.className = `movie-card ${isWatched ? 'is-watched' : ''}`;
        card.id = `card-${movie.id}`;

        card.innerHTML = `
          <span class="card-day-tag">📅 ${movie.day}</span>
          <div class="card-admin-actions">
            <button type="button" class="btn-card-util btn-edit-movie" data-id="${movie.id}" title="Editar Filme">✏️</button>
            <button type="button" class="btn-card-util btn-delete-movie" data-id="${movie.id}" title="Excluir Filme">🗑️</button>
          </div>
          <div class="poster-container">
            <img 
              src="${resolvedCover}" 
              alt="Poster de ${movie.title}" 
              class="poster-img" 
              loading="lazy"
              referrerpolicy="no-referrer"
            >
          </div>
          <div class="card-body">
            <span class="genre-badge">${movie.genre}</span>
            <h3 class="movie-title">${movie.title}</h3>
            <p class="movie-synopsis">${movie.synopsis}</p>
            <div class="button-group">
              <button type="button" class="btn-action btn-watched ${isWatched ? 'active-watched' : ''}" data-id="${movie.id}">
                Assisti ✔
              </button>
              <button type="button" class="btn-action btn-unwatched ${!isWatched ? 'active-unwatched' : ''}" data-id="${movie.id}">
                Não assisti ✕
              </button>
            </div>
          </div>
        `;

        const imgEl = card.querySelector('.poster-img');
        imgEl.addEventListener('error', () => {
          imgEl.src = resolveCoverUrl({ title: movie.title, cover: '' });
        }, { once: true });

        grid.appendChild(card);
      });

      weeksContainer.appendChild(weekEl);
    });

    if (term !== '' && totalMatches === 0) {
      const notFoundDiv = document.createElement('div');
      notFoundDiv.className = 'no-results';
      notFoundDiv.innerHTML = `<p>Nenhum filme ou semana encontrada para "<strong>${searchQuery}</strong>" 🎬</p>`;
      weeksContainer.appendChild(notFoundDiv);
    }

    updateProgress(watchedCount, currentMovies.length);
  }

  weeksContainer.addEventListener('click', (e) => {
    const btnAction = e.target.closest('.btn-action');
    if (btnAction) {
      const movieId = btnAction.dataset.id;
      const isWatched = btnAction.classList.contains('btn-watched');
      db.collection('movies').doc(movieId).update({ watched: isWatched });
      return;
    }

    const btnEdit = e.target.closest('.btn-edit-movie');
    if (btnEdit) {
      const id = btnEdit.dataset.id;
      const movie = currentMovies.find(m => m.id === id);
      if (!movie) return;

      formModalTitle.textContent = "Editar Filme";
      inputId.value = movie.id;
      inputTitle.value = movie.title;
      inputCover.value = movie.cover || '';
      inputWeek.value = movie.weekNumber || 1;
      inputDay.value = movie.day;
      inputGenre.value = movie.genre;
      inputSynopsis.value = movie.synopsis;

      updateSynopsisCounter();
      movieFormModal.classList.add('is-active');
      return;
    }

    const btnDelete = e.target.closest('.btn-delete-movie');
    if (btnDelete) {
      const id = btnDelete.dataset.id;
      const movie = currentMovies.find(m => m.id === id);
      if (!movie) return;

      movieToDeleteId = id;
      deleteModalText.innerHTML = `Tem certeza que deseja remover <strong>"${movie.title}"</strong> da maratona?`;
      deleteModal.classList.add('is-active');
    }
  });

  btnCancelDelete.addEventListener('click', () => {
    movieToDeleteId = null;
    deleteModal.classList.remove('is-active');
  });

  btnConfirmDelete.addEventListener('click', () => {
    if (!movieToDeleteId) return;
    db.collection('movies').doc(movieToDeleteId).delete()
      .then(() => {
        deleteModal.classList.remove('is-active');
        movieToDeleteId = null;
      });
  });

  movieForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = inputId.value;

    const movieData = {
      title: inputTitle.value.trim(),
      cover: inputCover.value.trim(),
      weekNumber: parseInt(inputWeek.value, 10),
      day: inputDay.value.trim(),
      genre: inputGenre.value.trim(),
      synopsis: inputSynopsis.value.trim()
    };

    if (id) {
      db.collection('movies').doc(id).update(movieData)
        .then(() => movieFormModal.classList.remove('is-active'));
    } else {
      movieData.watched = false;
      movieData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      db.collection('movies').add(movieData)
        .then(() => movieFormModal.classList.remove('is-active'));
    }
  });

  btnOpenAddModal.addEventListener('click', () => {
    movieForm.reset();
    inputId.value = '';
    inputCover.value = '';
    formModalTitle.textContent = "Novo Filme";
    updateSynopsisCounter();
    movieFormModal.classList.add('is-active');
  });

  btnCancelForm.addEventListener('click', () => {
    movieFormModal.classList.remove('is-active');
  });

  function updateProgress(watchedCount, totalMovies) {
    const percent = totalMovies > 0 ? Math.round((watchedCount / totalMovies) * 100) : 0;

    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${watchedCount} / ${totalMovies} assistidos (${percent}%)`;

    if (totalMovies > 0 && watchedCount === totalMovies) {
      triggerVictoryConfetti();
      setTimeout(() => {
        victoryModal.classList.add('is-active');
      }, 1000);
    }
  }

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    if (searchQuery) {
      btnClearSearch.classList.add('is-active');
    } else {
      btnClearSearch.classList.remove('is-active');
    }
    renderApp();
  });

  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    btnClearSearch.classList.remove('is-active');
    renderApp();
    searchInput.focus();
  });

  btnLoadMore.addEventListener('click', () => {
    const groups = groupMoviesByWeek(currentMovies);
    if (visibleWeeks < groups.length) {
      visibleWeeks++;
      renderApp();
    }
  });

  btnCloseModal.addEventListener('click', () => {
    victoryModal.classList.remove('is-active');
  });

  function triggerVictoryConfetti() {
    if (typeof confetti !== 'function') return;
    const count = 180;
    const defaults = { origin: { y: 0.7 } };

    function fire(particleRatio, opts) {
      confetti(Object.assign({}, defaults, opts, {
        particleCount: Math.floor(count * particleRatio)
      }));
    }

    fire(0.25, { spread: 26, startVelocity: 55, colors: ['#f9886c', '#8ec3b0'] });
    fire(0.2, { spread: 60, colors: ['#ffffff', '#b8a7ea'] });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ['#8ec3b0', '#ff9b82'] });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2, colors: ['#d6c7ff'] });
    fire(0.1, { spread: 120, startVelocity: 45, colors: ['#f9886c'] });
  }
});
