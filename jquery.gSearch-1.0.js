/**
 * jQuery gSearch
 *
 * @url		http://gsearch.scottreeddesign.com/
 * @author	Brian Reed <brian@scottreeddesign.com>
 * @version	1.0.0
 */
(function($){
	
	// Main plugin function
	$.fn.gSearch = function(options)
	{
		// Build main options before element iteration
		var o = $.extend({}, $.fn.gSearch.defaults, options);
		
		// Check it Search String Entered or Empty
		if(o.search_text == undefined) return this;
		if(o.search_text == "") return this;
		
		// Iterate through each element
		return this.each(function() {
			// Set jQuery object			
			var jquery_object = $(this);
			
			// Set class on object
			jquery_object.addClass('google-search-results');
			
			// Set pagination
			o.pagination = (o.pagination == 'false' || o.pagination == false) ? false : true;
			
			// Set loading message
			jquery_object.html('<span style="text-decoration: blink;">Loading...</span>');
			
			// Start Google web search		
			_google_search = new google.search.WebSearch();
			var results_html = "";	
			
			// Set result count
			if((o.count*1)>4)
				_google_search.setResultSetSize(google.search.Search.LARGE_RESULTSET);
			
			// Set site restriction
			if(o.site.length > 0){
				o.site = ((o.site.substring(0, 4)=='www.') ? o.site.substring(4, o.site.length) : o.site);
				if(o.site.length > 0) _google_search.setSiteRestriction(o.site);
			}
			
			// Set Google web search call back
			_google_search.setSearchCompleteCallback(this, 
			
				function(){
					results_html = "";
					// Get results 
					if (_google_search.results && _google_search.results.length > 0) {
						var results = _google_search.results;
						if(results.length > 0) {
							jquery_object.html('');		
							
							// Get results
							results_html += '<div class="results">';
							for (var i = 0; i < results.length; i++) {
								
								// Add result to object
								results_html += '<div class="result"><div class="title"><a href="'+unescape(results[i].url)+'"><span>'+results[i].title+'</span></a></div></div>';
								//results_html += '<div class="result"><div class="title"><a href="'+unescape(results[i].url)+'"><span>'+results[i].title+'</span></a></div><div class="snippet"><span>'+results[i].content+'</span></div></div>';
								
							}
							results_html += '</div>';						
							
							// Get pagination
							if(o.pagination){
								var cursor = _google_search.cursor;
								var curPage = cursor.currentPageIndex;
								results_html += '<div class="pagination"><ul>';
								
								// Set Previous
								if(curPage > 0)
									results_html += ' <li class="prev-next prev"><a href="#" onclick="_google_search.gotoPage('+((curPage*1)-1)+');return false;">Previous'+"</a></li> \r";
									
								for (var i = 0; i < cursor.pages.length; i++) {
									
									// Set Page Number Link
									results_html += ' <li class="numbers '+((curPage == i) ? " selected": "")+'"><a href="#" onclick="_google_search.gotoPage('+i+');return false;">'+cursor.pages[i].label+"</a></li> \r";									
								}
								
								// Set Next
								if(curPage < (cursor.pages.length-1))
									results_html +=
									' <li class="prev-next next"><a href="#" onclick="_google_search.gotoPage('+((curPage*1)+1)+');return false;">Next'+"</a></li> \r";
								results_html += "</ul></div>";
							}
							
							// Output html to object
							jquery_object.html(results_html);
							
						} else {
							jquery_object.html('');
						}
					} else {
						jquery_object.html('');
					}
					o.callback();
				}
												  
			, null);
		
			// Execute search
			_google_search.execute(o.search_text);
			
			// Set Object if no search results
			if(results_html.length == 0 && false)
			jquery_object.html('<div class="no-results"><p class="first-child">Your search - <b>'+o.search_text+'</b> - did not match any documents.</p><p class="second-child">Suggestions:</p><ul><li>Make sure all words are spelled correctly.</li><li>Try different keywords.</li><li>Try more general keywords.</li></ul></div>');
			
		});
	
	};
	
	// Default settings
	$.fn.gSearch.defaults =
	{
		// Search text
		search_text : '',
		
		// Results Per Page
		count : '4',
		
		// Site Specific
		site : '',
		
		// Show Pagination
		pagination : true,

		callback : function(){}
	};
	
})(jQuery);
