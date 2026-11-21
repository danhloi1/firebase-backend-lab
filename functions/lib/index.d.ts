/**
 * 1. AUTH BLOCKING FUNCTION: Chặn tài khoản không dùng email trường (.edu.vn)
 */
export declare const validateSchoolEmail: import("firebase-functions/v1").BlockingFunction;
/**
 * 2. FIRESTORE TRIGGER: Tự động cập nhật điểm đánh giá trung bình cho trường
 * Kích hoạt mỗi khi một document trong `reviews/{reviewId}` được tạo, sửa hoặc xóa.
 */
export declare const recalculateSchoolRating: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/core").Change<import("firebase-functions/v2/firestore").DocumentSnapshot> | undefined, {
    reviewId: string;
}>>;
/**
 * 3. CALLABLE FUNCTION: Cấp quyền Admin (Custom Claims) từ trang apps/admin
 */
export declare const grantAdminRole: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    message: string;
}>, unknown>;
//# sourceMappingURL=index.d.ts.map