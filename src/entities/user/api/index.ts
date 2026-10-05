/**
 * user 实体 · 数据访问层出口
 */
export {
  createAddress,
  deleteAddress,
  fetchCourses,
  fetchMajors,
  fetchMyAddresses,
  fetchMyProfile,
  fetchSchools,
  getCurrentUserId,
  sendPasswordResetEmail,
  setDefaultAddress,
  signIn,
  signOut,
  signUp,
  submitStudentVerification,
  updateAddress,
  updatePassword,
  updateProfile,
  type ProfileUpdateInput,
  type SignUpParams,
} from './auth'
