# Difficulty Levels Mapping - Bloom's Taxonomy

## Tóm tắt thay đổi

Các mức độ khó câu hỏi đã được cập nhật từ tiếng Việt sang tiếng Anh theo Bloom's Taxonomy để chuẩn hóa quốc tế.

## Bảng mapping

| Tiếng Việt (Cũ) | English (Mới) | Bloom's Level | Mô tả |
|------------------|---------------|---------------|-------|
| Biết | **Remember** | Level 1 | Nhớ, nhận biết các sự kiện, thuật ngữ, khái niệm cơ bản |
| Hiểu | **Understand** | Level 2 | Hiểu và giải thích ý tưởng, khái niệm |
| Vận dụng | **Apply** | Level 3 | Áp dụng kiến thức vào tình huống mới |
| Vận dụng cao | **Analyze** | Level 4 | Phân tích, tách nhỏ và xem xét các thành phần, mối quan hệ |

## Chi tiết Bloom's Taxonomy

### Remember (Nhớ - Level 1)
**Từ khóa hành động:** Nhận biết, nhớ lại, liệt kê, định nghĩa, mô tả
**Ví dụ câu hỏi:**
- "Stack là cấu trúc dữ liệu gì?"
- "Liệt kê các phương thức của Queue"

### Understand (Hiểu - Level 2)
**Từ khóa hành động:** Giải thích, tóm tắt, so sánh, phân loại, minh họa
**Ví dụ câu hỏi:**
- "Giải thích sự khác nhau giữa Stack và Queue"
- "Tại sao Binary Search Tree hiệu quả hơn Linear Search?"

### Apply (Vận dụng - Level 3)
**Từ khóa hành động:** Áp dụng, sử dụng, thực hiện, giải quyết, triển khai
**Ví dụ câu hỏi:**
- "Cho mảng [5,2,8,1], kết quả sau khi Quick Sort là gì?"
- "Viết code để kiểm tra chuỗi ngoặc hợp lệ"

### Analyze (Phân tích - Level 4)
**Từ khóa hành động:** Phân tích, so sánh, tương phản, phân biệt, kiểm tra
**Ví dụ câu hỏi:**
- "Phân tích độ phức tạp thời gian của thuật toán Merge Sort"
- "So sánh ưu nhược điểm của Hash Table và Binary Search Tree"

## Cách sử dụng trong API

### Request mới (English)
```json
{
  "subjectId": "66bb123456789abc",
  "title": "Đề thi giữa kỳ",
  "difficultyDistribution": {
    "Remember": 20,
    "Understand": 10,
    "Apply": 10,
    "Analyze": 10
  }
}
```

### ⚠️ Request cũ (Deprecated - sẽ bị loại bỏ)
```json
{
  "difficultyDistribution": {
    "Biết": 20,
    "Hiểu": 10,
    "Vận dụng": 10,
    "Vận dụng cao": 10
  }
}
```

## Migration Guide

### Cho Frontend Developers

Nếu bạn đang sử dụng API, cần cập nhật:

1. **Khi tạo bộ đề:**
```javascript
// ❌ CŨ
const request = {
  difficulty: "Hiểu",
  difficultyDistribution: {
    "Biết": 20,
    "Hiểu": 10
  }
};

// ✅ MỚI
const request = {
  difficulty: "Understand",
  difficultyDistribution: {
    "Remember": 20,
    "Understand": 10
  }
};
```

2. **Khi hiển thị câu hỏi:**
```javascript
// ❌ CŨ
const difficultyMap = {
  "Biết": "Dễ",
  "Hiểu": "Trung bình",
  "Vận dụng": "Khó",
  "Vận dụng cao": "Rất khó"
};

// ✅ MỚI
const difficultyMap = {
  "Remember": "Biết (Nhớ)",
  "Understand": "Hiểu",
  "Apply": "Vận dụng",
  "Analyze": "Phân tích"
};
```

### Cho Database Admins

Nếu cần migrate dữ liệu cũ:

```javascript
// Script migration (MongoDB)
db.questionSets.updateMany(
  { "questions.difficultyLevel": "Biết" },
  { $set: { "questions.$[elem].difficultyLevel": "Remember" } },
  { arrayFilters: [{ "elem.difficultyLevel": "Biết" }] }
);

db.questionSets.updateMany(
  { "questions.difficultyLevel": "Hiểu" },
  { $set: { "questions.$[elem].difficultyLevel": "Understand" } },
  { arrayFilters: [{ "elem.difficultyLevel": "Hiểu" }] }
);

db.questionSets.updateMany(
  { "questions.difficultyLevel": "Vận dụng" },
  { $set: { "questions.$[elem].difficultyLevel": "Apply" } },
  { arrayFilters: [{ "elem.difficultyLevel": "Vận dụng" }] }
);

db.questionSets.updateMany(
  { "questions.difficultyLevel": "Vận dụng cao" },
  { $set: { "questions.$[elem].difficultyLevel": "Analyze" } },
  { arrayFilters: [{ "elem.difficultyLevel": "Vận dụng cao" }] }
);
```

## Lợi ích của việc chuyển sang tiếng Anh

1. ✅ **Chuẩn quốc tế:** Tuân thủ Bloom's Taxonomy được công nhận toàn cầu
2. ✅ **Dễ tích hợp:** Dễ dàng tích hợp với các thư viện/tools quốc tế
3. ✅ **Tránh encoding issues:** Không lo lỗi UTF-8/encoding
4. ✅ **Code cleaner:** API request/response gọn gàng hơn
5. ✅ **SEO friendly:** Dễ dàng cho các công cụ tìm kiếm quốc tế

## Tài liệu tham khảo

- [Bloom's Taxonomy - Wikipedia](https://en.wikipedia.org/wiki/Bloom%27s_taxonomy)
- [Revised Bloom's Taxonomy](https://cft.vanderbilt.edu/guides-sub-pages/blooms-taxonomy/)

---

**Ngày cập nhật:** 5 tháng 11, 2025
**Breaking Change:** ⚠️ Có - Cần cập nhật API clients
