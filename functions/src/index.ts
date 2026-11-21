import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, AggregateField } from "firebase-admin/firestore";
import { beforeUserCreated } from "firebase-functions/v2/identity";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

initializeApp();
const db = getFirestore();

/**
 * 1. AUTH BLOCKING FUNCTION: Chặn tài khoản không dùng email trường (.edu.vn)
 */
export const validateSchoolEmail = beforeUserCreated((event) => {
  const user = event.data;
  const email = user?.email?.toLowerCase().trim() || "";

  // Kiểm tra đuôi email trường (có thể mở rộng danh sách domain cụ thể nếu cần)
  const isEduEmail = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.edu\.vn$/.test(email);

  if (!isEduEmail) {
    logger.warn(`Từ chối đăng ký từ email không hợp lệ: ${email}`);
    throw new HttpsError(
      "permission-denied",
      "Hệ thống chỉ chấp nhận đăng nhập bằng email trường (.edu.vn)."
    );
  }

  logger.info(`Cho phép tạo tài khoản sinh viên/giảng viên: ${email}`);
  return;
});

/**
 * 2. FIRESTORE TRIGGER: Tự động cập nhật điểm đánh giá trung bình cho trường
 * Kích hoạt mỗi khi một document trong `reviews/{reviewId}` được tạo, sửa hoặc xóa.
 */
export const recalculateSchoolRating = onDocumentWritten(
  "reviews/{reviewId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    const schoolId = afterData?.schoolId || beforeData?.schoolId;
    if (!schoolId) return;

    // Chỉ tính toán lại khi trạng thái có liên quan đến 'approved'
    const wasApproved = beforeData?.status === "approved";
    const isApproved = afterData?.status === "approved";
    const ratingChanged = beforeData?.rating !== afterData?.rating;

    if (!wasApproved && !isApproved) return;
    if (wasApproved && isApproved && !ratingChanged) return;

    try {
      // Dùng Aggregation Query của Firestore (tối ưu chi phí đọc)
      const approvedReviewsQuery = db
        .collection("reviews")
        .where("schoolId", "==", schoolId)
        .where("status", "==", "approved");

      const snapshot = await approvedReviewsQuery
        .aggregate({
          reviewCount: AggregateField.count(),
          avgRating: AggregateField.average("rating"),
        })
        .get();

      const { reviewCount, avgRating } = snapshot.data();

      // Làm tròn 1 chữ số thập phân (ví dụ: 4.5)
      const roundedAvg = avgRating ? Math.round(avgRating * 10) / 10 : 0;

      await db.collection("schools").doc(schoolId).set(
        {
          reviewCount,
          avgRating: roundedAvg,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      logger.info(
        `Đã cập nhật trường ${schoolId}: ${roundedAvg} sao (${reviewCount} lượt đánh giá)`
      );
    } catch (error) {
      logger.error(`Lỗi khi tính lại điểm cho trường ${schoolId}:`, error);
    }
  }
);

/**
 * 3. CALLABLE FUNCTION: Cấp quyền Admin (Custom Claims) từ trang apps/admin
 */
export const grantAdminRole = onCall(async (request) => {
  // Kiểm tra người gọi hàm bắt buộc phải đang là Admin
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Chỉ quản trị viên mới có quyền cấp quyền Admin."
    );
  }

  const targetEmail = request.data?.email as string;
  if (!targetEmail) {
    throw new HttpsError("invalid-argument", "Vui lòng cung cấp email hợp lệ.");
  }

  const targetUser = await getAuth().getUserByEmail(targetEmail.trim());
  await getAuth().setCustomUserClaims(targetUser.uid, { admin: true });

  logger.info(`Admin ${request.auth.token.email} đã cấp quyền cho ${targetEmail}`);
  return {
    message: `Đã cấp quyền quản trị viên thành công cho ${targetEmail}.`,
  };
});