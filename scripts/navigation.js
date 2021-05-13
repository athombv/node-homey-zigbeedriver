(function () {
  "use strict";
  let navigationState = false;
  let navigationSearchTerm = false;
  let $navigationButton;
  let $navigationSearch;
  let $navigationSearchReset;
  let $body;

  documentReady(function () {
    $body = document.querySelector(`body`);

    /**
     * Toggle mobile menu
     */
    $navigationButton = document.querySelector(`[data-navigation-toggle]`);
    $navigationButton.addEventListener('click', navigationOnClickHandler);

    /**
     * Active menu item
     */
    const url = window.location.toString();
    const page = url.substring(url.lastIndexOf('/') + 1).split('#')[0];
    const $activeMenuItem = document.querySelector(`[href="${page}.html"]`);

    if ($activeMenuItem) {
      $activeMenuItem.classList.add('is-active');
    }

    /**
     *  Save menu scroll position
     */
    const $navigationScroll = document.querySelector(`[data-navigation-scroll]`);

    $navigationScroll.scrollTop = localStorage.getItem('navigationScroll');

    // reset localstorage for scroll position
    localStorage.removeItem('navigationScroll');

    /**
     * Navigation Search
     */
    $navigationSearch = document.querySelector(`[data-navigation-search]`);
    $navigationSearchReset = document.querySelector(`[data-navigation-search-reset]`);

    $navigationSearch.addEventListener('keyup', searchOnKeyUpHandler);
    $navigationSearchReset.addEventListener('click', searchResetOnClickHandler);

    // reactivate filter after opening new page
    navigationSearchTerm = localStorage.getItem('navigationSearch');
    if (navigationSearchTerm) {
      $navigationSearch.value = navigationSearchTerm;
      filterKeyword();
    }

    // remove local storage for navigation search
    localStorage.removeItem('navigationSearch');

    /**
     * Save data over multiple pages
     */
    window.onbeforeunload = function () {
      // Save scroll position in navigation
      let position = $navigationScroll.scrollTop;
      localStorage.setItem('navigationScroll', position);
      // Save current search term for navigation
      if (navigationSearchTerm) {
        localStorage.setItem('navigationSearch', navigationSearchTerm);
      }
    }
  });

  /**
   * Navigation OnClick Handler
   * @description Toggles the mobile menu
   */
  function navigationOnClickHandler() {
    navigationState = !navigationState;

    if (navigationState) {
      $body.classList.add('is-navigation-active');
    } else {
      $body.classList.remove('is-navigation-active');
    }
  }

  /**
   * Search onKeyUp Handler
   * @description gets triggered when someone is using the filter in the navigation
   * @param event
   */
  function searchOnKeyUpHandler(event) {
    navigationSearchTerm = event.target.value;
    filterKeyword();
  }

  /**
   * Search Reset OnClick Handler
   * @description resets navigation filter input value
   */
  function searchResetOnClickHandler() {
    navigationSearchTerm = false;
    $navigationSearch.value = '';
    filterKeyword();
  }

  /**
   * Filter Keyword for navigation
   */
  function filterKeyword() {
    // reset matches
    const allMenuItems = document.querySelectorAll(`[data-search-key]`);
    allMenuItems.forEach((item) => {
      item.classList.remove('is-match');
    });

    // if no value stop
    if (!navigationSearchTerm) {
      $body.classList.remove('is-navigation-search');
      localStorage.removeItem('navigationSearch');
      return;
    }

    // show match
    $body.classList.add('is-navigation-search');

    const matches = document.querySelectorAll(`[data-search-key*="${navigationSearchTerm.toLowerCase()}"]`);
    matches.forEach((match) => {
      match.classList.add('is-match');
    });
  }

})();