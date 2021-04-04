from typing import Any, TypeVar, List, Optional, Dict
from abc import abstractmethod


class NameInUseError (Exception):
    def __init__(self, name):
        self.name = name

    def __str__(self):
        return 'Name {} is in use'.format(self.name)


class NotFoundError (Exception):
    def __str__(self):
        return 'Could not find'


class GroupNotEmptyError (Exception):
    def __str__(self):
        return 'Group not empty'


class CouldNotFindContainingGroupError (Exception):
    def __str__(self):
        return 'Could not find containing group'


IDType = TypeVar('IDType')
RequestType = TypeVar('RequestType')
SchemaType = TypeVar('SchemaType')


class SchemaEditorMessageHandler:
    """
    Schema editor message handler
    
    Handles messages from the client, invoking the appropriate method for each message and constructing responses
    to send back to the client side schema editor.
    
    Can be used in both Django and Flask.
    
    To use in a Django app:
    - implement a class-based view that inherits from `SchemaEditorAPI` as a mix-in
    - implement the `post` method such that it gets the messages, the target schema to edit and pass them to
      `handle_messages`. Return the result as a `JSONResponse`
    - the `IDType` type variable is the type used to represent entity uniquie IDs (e.g. for colour schemes, label
      classes, etc.). For example, this could be a database row primary key integer ID.
    - the `RequestType` type variable is Django's `HttpRequest`
    - the `SchemaType` type variable could be a Django model
     
    Subclass and override the update methods:
    - `update_schema`
    - `create_colour_scheme`
    - `delete_colour_scheme`
    - `create_group`
    - `delete_group`
    - `create_label_class`
    - `delete_label_class`
    """
    @abstractmethod
    def update_schema(self, request: RequestType, schema: SchemaType,
                      schema_js: Any) -> Optional[Dict[str, Dict[str, Any]]]:
        """Update a given schema to match the supplied

        Any newly created objects (e.g. colour schemes, groups or classes) will have a UUID in their `id`
        attribute. You may want to remap these UUID based IDs to some server side ID, e.g. (e.g. integer primary
        keys for database rows). The remapping is specified by returning a dict with the following:
            {'colour_scheme_id_mapping': <dict mapping client-side UUID to internal
                                          server side IDs for any newly created colour schemes>,
             'group_id_mapping': <dict mapping client-side UUID to internal
                                  server side IDs for any newly created groups>,
             'label_class_id_mapping': <dict mapping client-side UUID to internal
                                        server side IDs for any newly created classes>,
            }
        If you return `None`, no re-mapping will be performed

        Any newly created objects (e.g. colour schemes, groups or classes) will have a UUID in their `id`
        attribute. Remap these IDs to whichever internal format used (e.g. integer primary keys for database rows)
        and return them in the id_mapping dicts.

        :param request: request, e.g. a Django HttpRequest
        :param schema: the schema to update
        :param schema_js: JSON representation of the updated schema
        :return: dict providing ID re-mappings or None
        """
        pass

    @abstractmethod
    def create_colour_scheme(self, request: RequestType, schema: SchemaType, colour_scheme_js: Any) -> Optional[IDType]:
        """Create a new colour scheme

        If there is already a colour scheme with the same name/identifier, raise `NameInUseError`

        :param request: request, e.g. a Django HttpRequest
        :param schema: the schema to update
        :param colour_scheme_js: JSON representation of the new colour scheme
        :return: the server side ID allocated for the new colour scheme, or `None` if you ignored this message
        """
        pass

    @abstractmethod
    def delete_colour_scheme(self, request: RequestType, schema: SchemaType, colour_scheme_js: Any):
        """Delete a colour scheme

        If the colour schema could not be found, raise `NotFoundError`

        :param request: request, e.g. a Django HttpRequest
        :param schema: the schema to update
        :param colour_scheme_js: JSON representation of the colour scheme to delete
        """
        pass

    @abstractmethod
    def create_group(self, request: RequestType, schema: SchemaType, group_js: Any) -> Optional[IDType]:
        """Create a new label class group

        :param request: request, e.g. a Django HttpRequest
        :param schema: the schema to update
        :param group_js: JSON representation of the new group
        :return: the server side ID allocated for the new group, or `None` if you ignored this message
        """
        pass

    @abstractmethod
    def delete_group(self, request: RequestType, schema: SchemaType, group_js: Any):
        """Delete a label class group

        If the group is not empty, raise `GroupNotEmptyError`.
        If the group could not be found, raise `NotFoundError`

        :param request: request, e.g. a Django HttpRequest
        :param schema: the schema to update
        :param group_js: JSON representation of the new group
        """
        pass

    @abstractmethod
    def create_label_class(self, request: RequestType, schema: SchemaType,
                           containing_group_js: Any, label_class_js: Any) -> Optional[IDType]:
        """Create a new label class

        If the containing group could not be found, raise `CouldNotFindContainingGroupError`.
        If there is already a label class with the same name/identifier, raise `NameInUseError`.

        :param request: request, e.g. a Django HttpRequest
        :param schema: the schema to update
        :param containing_group_js: JSON representation of the group to which the new label classes is to be added
        :param label_class_js: JSON representation of the new label class
        :return: server side ID of the new label class, or `None` if you ignored this message
        """
        pass

    @abstractmethod
    def delete_label_class(self, request: RequestType, schema: SchemaType,
                           containing_group_js: Any, label_class_js: Any):
        """Delete a label class

        If the label class could not be found, raise `NotFoundError`.

        :param request: request, e.g. a Django HttpRequest
        :param schema: the schema to update
        :param containing_group_js: JSON representation of the group that contains the label class that is to
            be deleted
        :param label_class_js: JSON representation of the label class to be deleted
        """
        pass
    
    def handle_messages(self, request: RequestType, schema: SchemaType, messages_js: List[Any]) -> Any:
        """Handle a list of messages from a schema editor client and return a list of responses.
        
        :param request: request, e.g. a Django HttpRequest
        :param schema: the schema to update
        :param messages_js: a list of messages in JSON format
        :return: a dictionary of the form `{'responses': <list of responses to messages>}' that should be sent
            to the client
        """
        responses = []
        for message_js in messages_js:
            method = message_js['method']
            params = message_js['params']
            if method == 'update_schema':
                remapping = self.update_schema(request, schema, params['schema'])
                response = {'status': 'success'}
                if remapping is not None:
                    response.update(remapping)
            elif method == 'create_colour_scheme':
                try:
                    new_colour_scheme_id = self.create_colour_scheme(request, schema, params['colour_scheme'])
                    response = {'status': 'success'}
                    if new_colour_scheme_id is not None:
                        response['new_colour_scheme_id'] = new_colour_scheme_id
                except NameInUseError:
                    response = {'status': 'name_in_use'}
            elif method == 'delete_colour_scheme':
                try:
                    self.delete_colour_scheme(request, schema, params['colour_scheme'])
                    response = {'status': 'success'}
                except NotFoundError:
                    response = {'status': 'not_found'}
            elif method == 'create_group':
                new_group_id = self.create_group(request, schema, params['group'])
                response = {'status': 'success'}
                if new_group_id is not None:
                    response['new_group_id'] = new_group_id
            elif method == 'delete_group':
                try:
                    self.delete_group(request, schema, params['group'])
                    response = {'status': 'success'}
                except GroupNotEmptyError:
                    response = {'status': 'group_not_empty'}
                except NotFoundError:
                    response = {'status': 'not_found'}
            elif method == 'create_label_class':
                try:
                    new_label_class_id = self.create_label_class(request, schema, params['containing_group'], params['label_class'])
                    response = {'status': 'success'}
                    if new_label_class_id is not None:
                        response['new_label_class_id'] = new_label_class_id
                except NameInUseError:
                    response = {'status': 'name_in_use'}
                except CouldNotFindContainingGroupError:
                    response = {'status': 'could_not_find_containing_group'}
            elif method == 'delete_label_class':
                try:
                    self.delete_label_class(request, schema, params['containing_group'], params['label_class'])
                    response = {'status': 'success'}
                except NotFoundError:
                    response = {'status': 'not_found'}
            else:
                response = {'status': 'unknown_method'}
            responses.append(response)

        return {'responses': responses}
