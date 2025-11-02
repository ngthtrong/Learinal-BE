const SearchService = require('../services/search.service');

const searchService = new SearchService();

module.exports = {
  /**
   * GET /search?q=query&page=1&pageSize=20
   * Global search across all content
   */
  globalSearch: async (req, res, next) => {
    try {
      const { q, page, pageSize } = req.query;
      const userId = req.user?.userId;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          error: 'Query must be at least 2 characters',
        });
      }

      const results = await searchService.globalSearch(q, {
        userId,
        page: parseInt(page) || 1,
        pageSize: parseInt(pageSize) || 20,
      });

      res.json(results);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /search/question-sets?status=Published&difficulty=Hiểu&startDate=...
   * Advanced filtering for question sets
   */
  filterQuestionSets: async (req, res, next) => {
    try {
      const { status, difficulty, startDate, endDate, creatorId, isShared, page, pageSize } = req.query;

      const results = await searchService.filterQuestionSets(
        {
          status,
          difficulty,
          startDate,
          endDate,
          creatorId,
          isShared,
        },
        {
          page: parseInt(page) || 1,
          pageSize: parseInt(pageSize) || 20,
        }
      );

      res.json(results);
    } catch (e) {
      next(e);
    }
  },
};
