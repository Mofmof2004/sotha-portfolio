// Footer year
document.querySelectorAll('#year').forEach((el) => {
  el.textContent = new Date().getFullYear();
});

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', isOpen);
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Work page filtering
const filterButtons = document.querySelectorAll('.filter-btn');
const workCards = document.querySelectorAll('#workGrid .card');

if (filterButtons.length && workCards.length) {
  const applyFilter = (filter) => {
    filterButtons.forEach((b) => b.classList.toggle('active', b.dataset.filter === filter));
    workCards.forEach((card) => {
      const match = filter === 'all' || card.dataset.category === filter;
      card.classList.toggle('hidden', !match);
    });
  };

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
  });

  // Sidebar links on the homepage point to work.html#short-film etc. -
  // land on the matching filter instead of always showing "All".
  const initialFilter = window.location.hash.replace('#', '');
  if (initialFilter && [...filterButtons].some((b) => b.dataset.filter === initialFilter)) {
    applyFilter(initialFilter);
  }
}

// Homepage showcase cycle - expand one poster at a time, left to right,
// squeezing the rest aside so the active image shows uncropped. Hovering a
// tile previews it immediately and pauses the cycle; leaving resumes the
// cycle from the same point instead of restarting or skipping ahead.
const showcaseGrid = document.querySelector('.showcase-grid');
const showcaseTiles = document.querySelectorAll('.showcase-tile');

if (showcaseGrid && showcaseTiles.length > 1) {
  // Must match the CSS media query exactly (max-width: 860px), (orientation:
  // portrait) - otherwise JS can compute desktop squeeze-widths while CSS
  // renders the mobile carousel (or vice versa), and the two fight each
  // other: inline flex-basis from JS wins over CSS, causing tiles to
  // overflow sideways off a portrait screen.
  const mobileQuery = window.matchMedia('(max-width: 860px), (orientation: portrait)');
  const isMobileLayout = () => mobileQuery.matches;

  // Natural width/height ratio of each poster, in DOM order, so the
  // expanded width matches the image exactly instead of leaving black
  // bars (portrait posters) or still cropping (wide posters).
  const aspectRatios = [0.6, 1.7811, 1.7778, 1.7716];
  const MAX_ACTIVE_SHARE = 0.58; // cap the expanded tile at ~58% of the row
  const SCROLL_BOOST = 1.15; // extra width while scrolled into the info panel
  const GAP = 2; // px, matches .showcase-grid's gap
  const CYCLE_INTERVAL = 10000;

  const tileMedias = [...showcaseTiles].map((tile) => tile.querySelector('.tile-media'));
  const originalPositions = tileMedias.map((media) => media.style.backgroundPositionX || '50%');
  let activeIndex = 0;
  let hoveredIndex = null;
  let intervalId = null;
  let lastDisplayIndex = null;

  // Trial: on tiles that carry a clip (via YouTube, unlisted), show the
  // poster for 3s then play the clip in full for as long as it's being
  // hovered. Moving to another tile (or away entirely) stops it. Only one
  // video plays at a time.
  const videoPlaceholders = [...showcaseTiles].map((tile) => tile.querySelector('.tile-video'));
  const players = new Array(showcaseTiles.length).fill(null);
  let activeVideoIndex = null;
  let videoStartTimer = null;

  const stopTileVideo = () => {
    clearTimeout(videoStartTimer);
    videoStartTimer = null;
    if (activeVideoIndex === null) return;
    const player = players[activeVideoIndex];
    if (player && player.pauseVideo) {
      player.pauseVideo();
      player.seekTo(0);
      const iframe = player.getIframe && player.getIframe();
      if (iframe) iframe.classList.remove('visible');
    }
    activeVideoIndex = null;
  };

  videoPlaceholders.forEach((placeholder, i) => {
    if (!placeholder) return;

    // Belt-and-braces: leaving this tile always stops its own video, even
    // in the edge case where the auto-cycle was already sitting on it
    // before the hover started (so the "display index changed" check below
    // never fires on mouseleave). Only stop if this tile's video is the
    // one actually playing, so leaving an unrelated tile can't cut off
    // another tile's video.
    showcaseTiles[i].addEventListener('mouseleave', () => {
      if (activeVideoIndex === i) stopTileVideo();
    });
  });

  // The YouTube IFrame API loads asynchronously and calls this global once
  // ready; that's when the placeholder divs actually turn into players.
  window.onYouTubeIframeAPIReady = () => {
    videoPlaceholders.forEach((placeholder, i) => {
      if (!placeholder) return;
      players[i] = new YT.Player(placeholder, {
        // Without these, the API defaults the iframe to 640x390 (as real
        // width/height HTML attributes) until CSS overrides it a moment
        // later - on mobile that brief default-width flash can be enough
        // to throw off the carousel's scroll-snap measurements.
        width: '100%',
        height: '100%',
        videoId: placeholder.dataset.ytId,
        playerVars: {
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          disablekb: 1,
        },
        events: {
          onReady: (e) => e.target.getIframe().classList.add('tile-video'),
          // Once it plays through on its own, drop back to the poster.
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED) stopTileVideo();
          },
        },
      });
    });
  };

  const handleDisplayChange = (index) => {
    stopTileVideo();
    if (!videoPlaceholders[index]) return;

    videoStartTimer = setTimeout(() => {
      const player = players[index];
      if (!player || !player.playVideo) return; // API still loading
      player.mute();
      player.seekTo(0);
      player.playVideo();
      const iframe = player.getIframe && player.getIframe();
      if (iframe) iframe.classList.add('visible');
      activeVideoIndex = index;
    }, 3000);
  };

  // Shared math so both the normal layout pass and the scroll-boost handler
  // compute widths the same way (and always sum back to usableWidth).
  const computeWidths = (displayIndex, boosted) => {
    const usableWidth = showcaseGrid.clientWidth - GAP * (showcaseTiles.length - 1);
    const availableHeight = showcaseGrid.clientHeight;
    const naturalWidth = availableHeight * aspectRatios[displayIndex];
    let activeWidth = Math.min(naturalWidth, usableWidth * MAX_ACTIVE_SHARE);
    if (boosted) {
      activeWidth = Math.min(activeWidth * SCROLL_BOOST, usableWidth * MAX_ACTIVE_SHARE * SCROLL_BOOST);
    }
    const otherWidth = (usableWidth - activeWidth) / (showcaseTiles.length - 1);
    return { activeWidth, otherWidth };
  };

  const setTileWidths = (displayIndex, activeWidth, otherWidth) => {
    showcaseTiles.forEach((tile, i) => {
      tile.style.flexBasis = `${i === displayIndex ? activeWidth : otherWidth}px`;
    });
  };

  const applyLayout = () => {
    const displayIndex = hoveredIndex !== null ? hoveredIndex : activeIndex;
    const isRowLayout = !isMobileLayout();

    if (isRowLayout) {
      // Every tile gets an explicit pixel flex-basis (never a mix of px and
      // %) so the width transition always animates smoothly between two
      // lengths in the same unit, instead of snapping.
      const { activeWidth, otherWidth } = computeWidths(displayIndex, false);
      setTileWidths(displayIndex, activeWidth, otherWidth);

      showcaseTiles.forEach((tile, i) => {
        const isActive = i === displayIndex;
        tile.style.flexGrow = '0';
        tile.style.flexShrink = '0';
        tile.classList.toggle('is-expanded', isActive);
        if (!isActive) tile.scrollTop = 0;
        // Keep 'cover' for the whole resize - it scales smoothly as the box
        // grows/shrinks. Switching straight to 'contain' here made the
        // active tile look like its image got swapped for a smaller one
        // that then grew, since cover<->contain can't animate (not
        // interpolatable values) - it just snaps instantly. The
        // transitionend listener below switches the active tile to
        // 'contain' only once it's actually finished growing.
        tileMedias[i].style.backgroundSize = '';
        tileMedias[i].style.backgroundPositionX = isActive ? '50%' : originalPositions[i];
      });
    } else {
      // Swipe carousel: every card is full-width on its own, so there's no
      // "active" tile to squeeze around. Use 'contain' so the complete
      // poster is always visible, uncropped - any letterbox gaps (when a
      // poster's aspect ratio doesn't match the screen's) are filled by
      // .tile-media's own dark background, matching the site's theme.
      showcaseTiles.forEach((tile, i) => {
        tile.style.flexGrow = '';
        tile.style.flexShrink = '';
        tile.style.flexBasis = '';
        tile.classList.remove('is-expanded');
        tileMedias[i].style.backgroundSize = 'contain';
        tileMedias[i].style.backgroundPositionX = '50%';
      });
    }

    if (displayIndex !== lastDisplayIndex) {
      lastDisplayIndex = displayIndex;
      handleDisplayChange(displayIndex);
    }
  };

  const startCycle = () => {
    clearInterval(intervalId);
    // No ambient auto-expand on the mobile swipe carousel - navigation is
    // manual there (swipe), so cycling in the background would just fight
    // the user's own swipes and silently pre-load video off-screen.
    if (isMobileLayout()) return;
    intervalId = setInterval(() => {
      activeIndex = (activeIndex + 1) % showcaseTiles.length;
      applyLayout();
    }, CYCLE_INTERVAL);
  };

  showcaseTiles.forEach((tile, i) => {
    tile.addEventListener('mouseenter', () => {
      clearInterval(intervalId);
      hoveredIndex = i;
      applyLayout();
    });

    tile.addEventListener('mouseleave', () => {
      hoveredIndex = null;
      applyLayout();
      startCycle();
    });

    // Reveal the complete uncropped image only once this tile has actually
    // finished growing (see the comment in applyLayout for why).
    tile.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'flex-basis') return;
      if (tile.classList.contains('is-expanded')) {
        tileMedias[i].style.backgroundSize = 'contain';
      }
    });

    // Scrolling into the info panel grows the frame a bit more (~15%);
    // scrolling back to the top shrinks it back.
    tile.addEventListener('scroll', () => {
      if (!tile.classList.contains('is-expanded')) return;
      const boosted = tile.scrollTop > 8;
      const { activeWidth, otherWidth } = computeWidths(i, boosted);
      setTileWidths(i, activeWidth, otherWidth);
    });
  });

  // Mobile swipe carousel: there's no hover to trigger the poster->3s->video
  // sequence, so trigger it off whichever card has snapped into view
  // instead. Debounced so it fires once a swipe settles, not mid-gesture.
  let mobileSettledIndex = null;
  let mobileScrollTimer = null;

  showcaseGrid.addEventListener('scroll', () => {
    if (!isMobileLayout()) return;
    clearTimeout(mobileScrollTimer);
    mobileScrollTimer = setTimeout(() => {
      const index = Math.round(showcaseGrid.scrollLeft / showcaseGrid.clientWidth);
      const clamped = Math.max(0, Math.min(index, showcaseTiles.length - 1));
      if (clamped !== mobileSettledIndex) {
        mobileSettledIndex = clamped;
        handleDisplayChange(clamped);
      }
    }, 150);
  });

  applyLayout();
  startCycle();

  if (isMobileLayout()) {
    mobileSettledIndex = 0;
    handleDisplayChange(0);
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      applyLayout();
      startCycle(); // re-evaluate: crossing the mobile/desktop boundary starts/stops it
    }, 150);
  });
}

// Contact form - submits to Netlify Forms (data-netlify="true" on the
// <form> is what registers it with Netlify at deploy time).
const contactForm = document.getElementById('contactForm');
const formStatus = document.getElementById('formStatus');

if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const body = new URLSearchParams(new FormData(contactForm)).toString();

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
      .then(() => {
        formStatus.textContent = "Thanks for reaching out — I'll get back to you soon.";
        contactForm.reset();
      })
      .catch(() => {
        formStatus.textContent = 'Something went wrong - please email directly instead.';
      });
  });
}
