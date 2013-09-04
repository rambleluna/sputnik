'use strict';

function ReadCtrl($scope, $window, feedsService) {
    
    var organizer = require('./helpers/articlesOrganizer');
    
    var pageIndex = 0;
    var articlesPerPage = 50;
    
    $scope.state = 'notInitiated';
    
    function downloadFeeds() {
        
        if ($scope.state === 'noFeeds' || $scope.state === 'refreshing') {
            return;
        }
        
        feedsService.downloadFeeds()
        .progress(function (progress) {
            var ratio = Math.round(progress.completed / progress.total * 100);
            angular.element('.refreshing__progress-bar').css('width', ratio + '%');
        })
        .then(showArticles);
        
        $scope.state = 'refreshing';
        angular.element('.refreshing__progress-bar').css('width', '0%');
    }
    
    function showArticles() {
        var from = pageIndex * articlesPerPage;
        var to = from + articlesPerPage;
        
        console.log("pagination from: " + from + " to: " + to);
        
        var feedUrls = $scope.selectedItem.feeds.map(function (feed) {
            return feed.url;
        });
        
        feedsService.getArticles(feedUrls, from, to)
        .then(function (result) {
            
            $scope.isPrevPage = (from > 0);
            $scope.isNextPage = (to <= result.numAll);
            
            console.log("result.numAll: " + result.numAll);
            
            renderArticles(result.articles);
            $scope.$apply();
        });
    }
    
    function renderArticles(articles) {
        $scope.days = organizer.organizeByDays(articles);
        $scope.state = 'articles';
        
        // little hack to scroll to top every time articles list was updated,
        // but articles list is display: none sometimes and then you have
        // to wait for it to appear to set the scroll
        var interval = setInterval(function () {
            var articlesList = angular.element('.js-articles-list');
            if (articlesList.scrollTop() !== 0) {
                articlesList.scrollTop(0);
            } else {
                clearInterval(interval);
            }
            lazyLoadImages();
        }, 1);
    }
    
    $scope.feedsTree = feedsService.central.tree;
    $scope.all = feedsService.central;
    $scope.days = [];
    
    $scope.refresh = downloadFeeds;
    
    $scope.selectedItem = $scope.all;
    $scope.selectItem = function (item) {
        $scope.selectedItem = item;
        pageIndex = 0;
        if ($scope.state !== 'noFeeds' && $scope.state !== 'refreshing') {
            showArticles();
        }
    };
    
    $scope.prevPage = function () {
        if ($scope.isPrevPage) {
            pageIndex -= 1;
            showArticles();
        }
    };
    
    $scope.nextPage = function () {
        if ($scope.isNextPage) {
            pageIndex += 1;
            showArticles();
        }
    };
    
    $scope.markCategoryItemAsRead = function (categoryItem) {
        categoryItem.articles.forEach(function (article) {
            article.setIsRead(true);
        });
    };
    
    if (feedsService.central.feeds.length === 0) {
        $scope.state = 'noFeeds';
    }
    
    $scope.$emit('readCtrlInstantiated', function (message) {
        switch (message) {
        case 'feedAdded':
        case 'feedsImported':
        case 'firstRun':
            downloadFeeds();
            break;
        }
    });
    
    if ($scope.state === 'notInitiated') {
        showArticles();
    }
    
    //-----------------------------------------------------
    // Lazy load images
    //-----------------------------------------------------
    
    function lazyLoadImages() {
        angular.element('img[data-lazy-src]').each(function (i, elem) {
            var currScroll = angular.element(".js-articles-list").scrollTop();
            var range = $window.outerHeight * 4;
            if (elem.offsetTop > currScroll - range &&
                elem.offsetTop < currScroll + range) {
                var jqElem = angular.element(elem);
                var src = jqElem.attr('data-lazy-src');
                jqElem.attr('src', src);
                jqElem.removeAttr('data-lazy-src');
            }
        });
    }
    
    angular.element(".js-articles-list").scroll(lazyLoadImages);
    
    //-----------------------------------------------------
    // Scrolling to next unread article
    //-----------------------------------------------------
    
    function findNextUnreadArticleId(referenceArticleGuid) {
        var mode = 'searchingReference';
        var dayIndex = 0;
        var articleIndex = 0;
        var days = $scope.days;
        
        function findNext() {
            for (dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
                var day = days[dayIndex];
                for (articleIndex = 0; articleIndex < day.articles.length; articleIndex += 1) {
                    var art = day.articles[articleIndex];
                    
                    switch (mode) {
                    case 'searchingReference':
                        // find reference article in list
                        if (art.guid === referenceArticleGuid) {
                            mode = 'searchingNextUnread';
                        }
                        break;
                    case 'searchingNextUnread':
                    case 'searchingFromBeginning':
                        // find next unread article just after reference article
                        if (art.isRead === false) {
                            if (articleIndex === 0) {
                                // if an article is first in its day return day id instead of article id
                                return day.id;
                            } else {
                                return art.id;
                            }
                        }
                        break;
                    }
                    
                    // if we have turned full circle, and nothing was found
                    if (mode === 'searchingFromBeginning' &&
                        art.guid === referenceArticleGuid) {
                        return null;
                    }
                    
                    // if last item in list reached without hit,
                    // search again from beginning
                    if (mode === 'searchingNextUnread' &&
                        dayIndex === days.length - 1 &&
                        articleIndex === day.articles.length - 1) {
                        dayIndex = -1;
                        mode = 'searchingFromBeginning';
                    }
                }
            }
            return null;
        }
        
        return findNext();
    }
    
    $scope.$on('articleReadDone', function (evt, articleGuid) {
        var nextId = findNextUnreadArticleId(articleGuid);
        if (nextId) {
            var scroll = angular.element('#' + nextId)[0].offsetTop - 20;
            angular.element(".js-articles-list").animate({
                scrollTop: scroll
            }, 1000);
        }
    });
}