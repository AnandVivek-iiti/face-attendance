const Department = require('../models/Department');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const { toObjectId } = require('../utils/objectId');
const { AUDIT_ACTIONS } = require('../config/constants');

const getById = async (id) => {
  const department = await Department.findById(toObjectId(id, 'department id'));
  if (!department) throw new AppError('Department not found', 404, { code: 'DEPARTMENT_NOT_FOUND' });
  return department;
};

const list = () => Department.find().sort({ code: 1 });

const create = async (data, actor) => {
  const existing = await Department.findOne({ code: data.code });
  if (existing) throw new AppError('A department with that code already exists', 409, { code: 'DEPARTMENT_TAKEN' });
  const department = await Department.create(data);
  if (actor) {
    await auditService.record(
      auditService.userEntry(actor, {
        action: AUDIT_ACTIONS.DEPARTMENT_CREATED,
        after: { departmentId: department._id, code: department.code }
      })
    );
  }
  return department;
};

const update = async (id, data) => {
  const department = await getById(id);
  department.set(data);
  await department.save();
  return department;
};

const remove = async (id, actor) => {
  const department = await getById(id);
  const inUse = await Student.exists({ department: department.code });
  if (inUse) {
    throw new AppError('A department with enrolled students cannot be removed', 409, {
      code: 'DEPARTMENT_IN_USE'
    });
  }
  await department.deleteOne();
  if (actor) {
    await auditService.record(
      auditService.userEntry(actor, {
        action: AUDIT_ACTIONS.DEPARTMENT_REMOVED,
        after: { departmentId: department._id, code: department.code }
      })
    );
  }
  return { id: department._id, code: department.code };
};

module.exports = { getById, list, create, update, remove };
