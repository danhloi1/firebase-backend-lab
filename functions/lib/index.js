"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantAdminRole = exports.recalculateSchoolRating = exports.validateSchoolEmail = void 0;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const identity_1 = require("firebase-functions/v2/identity");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
/**
 * 1. AUTH BLOCKING FUNCTION: Chặn tài khoản không dùng email trường (.edu.vn)
 */
exports.validateSchoolEmail = (0, identity_1.beforeUserCreated)((event) => {
    const user = event.data;
    const email = user?.email?.toLowerCase().trim() || "";
    // Kiểm tra đuôi email trường (có thể mở rộng danh sách domain cụ thể nếu cần)
    const isEduEmail = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.edu\.vn$/.test(email);
    if (!isEduEmail) {
        logger.warn(`Từ chối đăng ký từ email không hợp lệ: ${email}`);
        throw new https_1.HttpsError("permission-denied", "Hệ thống chỉ chấp nhận đăng nhập bằng email trường (.edu.vn).");
    }
    logger.info(`Cho phép tạo tài khoản sinh viên/giảng viên: ${email}`);
    return;
});
/**
 * 2. FIRESTORE TRIGGER: Tự động cập nhật điểm đánh giá trung bình cho trường
 * Kích hoạt mỗi khi một document trong `reviews/{reviewId}` được tạo, sửa hoặc xóa.
 */
exports.recalculateSchoolRating = (0, firestore_2.onDocumentWritten)("reviews/{reviewId}", async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const schoolId = afterData?.schoolId || beforeData?.schoolId;
    if (!schoolId)
        return;
    // Chỉ tính toán lại khi trạng thái có liên quan đến 'approved'
    const wasApproved = beforeData?.status === "approved";
    const isApproved = afterData?.status === "approved";
    const ratingChanged = beforeData?.rating !== afterData?.rating;
    if (!wasApproved && !isApproved)
        return;
    if (wasApproved && isApproved && !ratingChanged)
        return;
    try {
        // Dùng Aggregation Query của Firestore (tối ưu chi phí đọc)
        const approvedReviewsQuery = db
            .collection("reviews")
            .where("schoolId", "==", schoolId)
            .where("status", "==", "approved");
        const snapshot = await approvedReviewsQuery
            .aggregate({
            reviewCount: firestore_1.AggregateField.count(),
            avgRating: firestore_1.AggregateField.average("rating"),
        })
            .get();
        const { reviewCount, avgRating } = snapshot.data();
        // Làm tròn 1 chữ số thập phân (ví dụ: 4.5)
        const roundedAvg = avgRating ? Math.round(avgRating * 10) / 10 : 0;
        await db.collection("schools").doc(schoolId).set({
            reviewCount,
            avgRating: roundedAvg,
            updatedAt: new Date(),
        }, { merge: true });
        logger.info(`Đã cập nhật trường ${schoolId}: ${roundedAvg} sao (${reviewCount} lượt đánh giá)`);
    }
    catch (error) {
        logger.error(`Lỗi khi tính lại điểm cho trường ${schoolId}:`, error);
    }
});
/**
 * 3. CALLABLE FUNCTION: Cấp quyền Admin (Custom Claims) từ trang apps/admin
 */
exports.grantAdminRole = (0, https_1.onCall)(async (request) => {
    // Kiểm tra người gọi hàm bắt buộc phải đang là Admin
    if (request.auth?.token?.admin !== true) {
        throw new https_1.HttpsError("permission-denied", "Chỉ quản trị viên mới có quyền cấp quyền Admin.");
    }
    const targetEmail = request.data?.email;
    if (!targetEmail) {
        throw new https_1.HttpsError("invalid-argument", "Vui lòng cung cấp email hợp lệ.");
    }
    const targetUser = await (0, auth_1.getAuth)().getUserByEmail(targetEmail.trim());
    await (0, auth_1.getAuth)().setCustomUserClaims(targetUser.uid, { admin: true });
    logger.info(`Admin ${request.auth.token.email} đã cấp quyền cho ${targetEmail}`);
    return {
        message: `Đã cấp quyền quản trị viên thành công cho ${targetEmail}.`,
    };
});
